import { resolveJsonPath } from "../../helper/json-path-resolver";
import { scrapeIndicator } from "../scrapers";
import { compareValuesWithTolerance } from "./toleranceEngine";
import type {
  PNGIndicator,
  PNGIndicatorResult,
  PNGValidationResponse,
  PNGValidationSummary,
} from "../types";

const FETCH_TIMEOUT_MS = 10_000;

const SCRAPE_INDICATOR_IDS = new Set([
  "central_bank_repo_rate",
  "corporate_tax_rate",
  "gcf_eligibility",
  "cost_of_equity_ke",
  "grid_electricity_tariff",
  "diesel_displacement_cost",
]);

/**
 * Validates a single indicator (either HTML Scraped, JSON API, or Internal)
 */
export async function validateSinglePNGIndicator(
  indicator: PNGIndicator,
  mode: "LIVE" | "FIXTURE_OFFLINE" = "LIVE"
): Promise<PNGIndicatorResult> {
  const {
    indicator_id,
    display_name,
    category,
    source_url,
    json_path,
    ui_value,
    unit,
    tolerance,
  } = indicator;

  // 1. Internal parameters (user input, calculated, assumptions)
  if (source_url.startsWith("internal://")) {
    return {
      indicator_id,
      display_name,
      category,
      source_url,
      source_value: null,
      ui_value,
      unit,
      tolerance,
      difference: null,
      status: "SKIPPED",
      is_matched: false,
      message: "Internal parameter — project assumption or calculated metric.",
      metadata: {
        sourceType: source_url.includes("user_input") ? "INTERNAL_USER_INPUT" : "INTERNAL_CALCULATED",
        provider: "Internal Model",
      },
    };
  }

  // 2. HTML Scraper indicators (Milestone 1 targets)
  if (SCRAPE_INDICATOR_IDS.has(indicator_id) || indicator.is_scrape_target) {
    const scraped = await scrapeIndicator(indicator_id, source_url, mode);

    if (scraped.status === "UNDER_REVIEW") {
      return {
        indicator_id,
        display_name,
        category,
        source_url,
        source_value: scraped.sourceValue,
        ui_value,
        unit,
        tolerance,
        difference: null,
        status: "UNDER_REVIEW",
        is_matched: false,
        message: scraped.message,
        metadata: scraped.metadata,
      };
    }

    if (scraped.status === "SKIPPED") {
      return {
        indicator_id,
        display_name,
        category,
        source_url,
        source_value: null,
        ui_value,
        unit,
        tolerance,
        difference: null,
        status: "SKIPPED",
        is_matched: false,
        message: scraped.message,
        metadata: scraped.metadata,
      };
    }

    if (scraped.status === "ERROR") {
      return {
        indicator_id,
        display_name,
        category,
        source_url,
        source_value: null,
        ui_value,
        unit,
        tolerance,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message: scraped.message,
        metadata: scraped.metadata,
      };
    }

    // Scrape SUCCESS — compare values
    const comp = compareValuesWithTolerance(scraped.sourceValue, ui_value, tolerance);

    return {
      indicator_id,
      display_name,
      category,
      source_url,
      source_value: scraped.sourceValue,
      ui_value,
      unit,
      tolerance,
      difference: comp.difference,
      status: "SUCCESS",
      is_matched: comp.isMatched,
      message: comp.isMatched
        ? `Validated successfully via ${scraped.metadata.provider} (${comp.matchType})`
        : `Discrepancy: source has ${scraped.sourceValue}, UI has ${ui_value}`,
      metadata: scraped.metadata,
    };
  }

  // 3. Indicators without json_path that are not registered scrapers
  if (!json_path) {
    return {
      indicator_id,
      display_name,
      category,
      source_url,
      source_value: null,
      ui_value,
      unit,
      tolerance,
      difference: null,
      status: "SKIPPED",
      is_matched: false,
      message: "No json_path or scraper registered — non-JSON resource.",
      metadata: { sourceType: "HTML_SCRAPE", provider: "External" },
    };
  }

  // 4. JSON API indicators (World Bank, FX API, GSA)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(source_url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "RXBE-PNG-Validator/1.0",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return {
        indicator_id,
        display_name,
        category,
        source_url,
        source_value: null,
        ui_value,
        unit,
        tolerance,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message: `HTTP ${res.status} ${res.statusText}`,
        metadata: { sourceType: "JSON_API", provider: "API Provider" },
      };
    }

    const data = await res.json();
    let extracted = resolveJsonPath(data, json_path);

    // GSA API path fallback if root path differs
    if ((extracted === undefined || extracted === null) && source_url.includes("globalsolaratlas")) {
      const gsaKey = json_path.replace(/^\[.*?\]\./, "").toLowerCase();
      if (typeof data === "object" && data !== null) {
        const nested = (data as Record<string, unknown>)["annual"] || (data as Record<string, unknown>)["output"];
        if (nested && typeof nested === "object") {
          extracted = (nested as Record<string, unknown>)[gsaKey];
        }
      }
    }

    if (extracted === undefined || extracted === null) {
      return {
        indicator_id,
        display_name,
        category,
        source_url,
        source_value: null,
        ui_value,
        unit,
        tolerance,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message: `Value not found at json_path '${json_path}'.`,
        metadata: { sourceType: "JSON_API", provider: "API Provider" },
      };
    }

    const comp = compareValuesWithTolerance(extracted, ui_value, tolerance);
    const sourceValue = typeof extracted === "string" ? extracted : Number(extracted);

    return {
      indicator_id,
      display_name,
      category,
      source_url,
      source_value: sourceValue,
      ui_value,
      unit,
      tolerance,
      difference: comp.difference,
      status: "SUCCESS",
      is_matched: comp.isMatched,
      message: comp.isMatched ? `Matched via API (${comp.matchType})` : `Value mismatch`,
      metadata: { sourceType: "JSON_API", provider: "API Provider" },
    };
  } catch (err) {
    return {
      indicator_id,
      display_name,
      category,
      source_url,
      source_value: null,
      ui_value,
      unit,
      tolerance,
      difference: null,
      status: "ERROR",
      is_matched: false,
      message: (err as Error).message || "Fetch failure",
      metadata: { sourceType: "JSON_API", provider: "API Provider" },
    };
  }
}

/**
 * Runs validation for a complete set of PNG indicators
 */
export async function validatePNGDataset(
  indicators: PNGIndicator[],
  mode: "LIVE" | "FIXTURE_OFFLINE" = "LIVE"
): Promise<PNGValidationResponse> {
  const now = new Date();
  const testRunId = `PNG-VAL-${now.toISOString().slice(0, 10)}-${String(now.getTime()).slice(-4)}`;

  // Run in parallel with concurrency limit or Promise.all
  const results = await Promise.all(
    indicators.map((ind) => validateSinglePNGIndicator(ind, mode))
  );

  let matched = 0;
  let mismatched = 0;
  let under_review = 0;
  let skipped = 0;
  let errors = 0;
  let scrape_targets = 0;
  let api_targets = 0;

  for (const r of results) {
    if (SCRAPE_INDICATOR_IDS.has(r.indicator_id)) {
      scrape_targets++;
    } else if (r.source_url.startsWith("http") && !r.source_url.startsWith("internal://")) {
      api_targets++;
    }

    switch (r.status) {
      case "SUCCESS":
        if (r.is_matched) matched++;
        else mismatched++;
        break;
      case "UNDER_REVIEW":
        under_review++;
        break;
      case "SKIPPED":
        skipped++;
        break;
      case "ERROR":
        errors++;
        break;
    }
  }

  const evaluatedCount = matched + mismatched;
  const pass_rate_pct = evaluatedCount > 0 ? parseFloat(((matched / evaluatedCount) * 100).toFixed(1)) : 100;
  const overall_status = mismatched === 0 && errors === 0;

  const summary: PNGValidationSummary = {
    total_indicators: results.length,
    scrape_targets,
    api_targets,
    matched,
    mismatched,
    under_review,
    skipped,
    errors,
    pass_rate_pct,
    overall_status,
  };

  return {
    test_run_id: testRunId,
    execution_mode: mode,
    executed_at: now.toISOString(),
    country: "Papua New Guinea",
    country_code: "PG",
    iso3: "PNG",
    summary,
    results,
  };
}
