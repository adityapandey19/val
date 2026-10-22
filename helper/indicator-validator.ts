import type { Indicator, IndicatorResult } from "./types";
import { resolveJsonPath } from "./json-path-resolver";
import { scrapeValue } from "./scraper";
import {
  isPdfTarget,
  scrapePdfValue,
  extractPdfText,
  extractValueFromPdfText,
} from "./pdf-extractor";

/** Timeout in milliseconds for fetching external APIs. */
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the source_url points to an internal (non-fetchable)
 * resource such as `internal://user_input` or `internal://calculated`.
 */
function isInternalSource(url: string): boolean {
  return url.startsWith("internal://");
}

/**
 * Compares two values using the indicator's tolerance.
 *
 * - Numeric values: `|source - ui| <= tolerance`
 * - String values:  exact (case-insensitive) equality; tolerance is ignored.
 */
function compareValues(
  sourceValue: unknown,
  uiValue: number | string,
  tolerance: number
): { isMatched: boolean; difference: number | null } {
  // ---- string comparison ----
  if (typeof uiValue === "string" || typeof sourceValue === "string") {
    const isMatched =
      String(sourceValue).trim().toLowerCase() ===
      String(uiValue).trim().toLowerCase();
    return { isMatched, difference: null };
  }

  // ---- numeric comparison (dual-mode tolerance) ----
  const srcNum = Number(sourceValue);
  if (Number.isNaN(srcNum)) {
    return { isMatched: false, difference: null };
  }

  const uiNum = Number(uiValue);
  const diff = srcNum - uiNum;
  const absDiff = Math.abs(diff);

  // Mode 1: absolute — |difference| ≤ tolerance
  const absoluteMatch = absDiff <= tolerance;

  // Mode 2: relative — |difference / ui_value| ≤ tolerance  (as a fraction)
  // Avoids division by zero; when ui_value is 0, only absolute mode applies.
  const relativeMatch =
    uiNum !== 0 && Math.abs(diff / uiNum) <= tolerance;

  const isMatched = absoluteMatch || relativeMatch;
  return { isMatched, difference: parseFloat(diff.toFixed(10)) };
}

// ---------------------------------------------------------------------------
// Core validator
// ---------------------------------------------------------------------------

/**
 * Validates a single indicator by:
 *  1. Checking if it's fetchable (non-internal URL + has json_path).
 *  2. Fetching the source URL.
 *  3. Extracting the value via json_path.
 *  4. Comparing against ui_value within tolerance.
 */
export async function validateIndicator(
  indicator: Indicator
): Promise<IndicatorResult> {
  const {
    indicator_id,
    display_name,
    source_url,
    json_path,
    ui_value,
    tolerance,
  } = indicator;

  // ── Skip: internal source ─────────────────────────────────────────────
  if (isInternalSource(source_url)) {
    return {
      indicator_id,
      display_name,
      source_url,
      source_value: null,
      ui_value,
      tolerance,
      difference: null,
      status: "SKIPPED",
      is_matched: false,
      message: "Internal source — nothing to fetch.",
    };
  }

  const hasJsonPath = json_path !== null && json_path !== undefined && json_path !== "";
  const scrapeConfig = indicator.scrape_config;

  // ── Route 1: PDF Target (URL ends with .pdf or explicit PDF content_type) ─
  if (isPdfTarget(source_url, null, scrapeConfig)) {
    try {
      const extracted = await scrapePdfValue(source_url, indicator);
      const { isMatched, difference } = compareValues(
        extracted,
        ui_value,
        tolerance
      );

      return {
        indicator_id,
        display_name,
        source_url,
        source_value: extracted,
        ui_value,
        tolerance,
        difference,
        status: "SUCCESS",
        is_matched: isMatched,
        message: null,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown PDF extraction error.";
      return {
        indicator_id,
        display_name,
        source_url,
        source_value: null,
        ui_value,
        tolerance,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message,
      };
    }
  }

  // ── Route 2: HTML Scrape Config (CSS selector / Regex / Meta name) ──────
  if (!hasJsonPath && scrapeConfig) {
    try {
      const scraped = await scrapeValue(source_url, scrapeConfig);
      const { isMatched, difference } = compareValues(
        scraped,
        ui_value,
        tolerance
      );

      return {
        indicator_id,
        display_name,
        source_url,
        source_value: scraped,
        ui_value,
        tolerance,
        difference,
        status: "SUCCESS",
        is_matched: isMatched,
        message: null,
      };
    } catch (error: unknown) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? `Scrape timed out after 15s.`
          : error instanceof Error
            ? error.message
            : "Unknown scrape error.";

      return {
        indicator_id,
        display_name,
        source_url,
        source_value: null,
        ui_value,
        tolerance,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message,
      };
    }
  }

  // ── Route 3: No json_path and no scrapeConfig ─────────────────────────
  // Fetch to check if the server returns a PDF dynamically
  if (!hasJsonPath && !scrapeConfig) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(source_url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/pdf,application/json,text/html,*/*",
        },
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type") || "";
      if (contentType.toLowerCase().includes("application/pdf")) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const text = await extractPdfText(buffer);
        const extracted = extractValueFromPdfText(text, indicator);
        const { isMatched, difference } = compareValues(
          extracted,
          ui_value,
          tolerance
        );

        return {
          indicator_id,
          display_name,
          source_url,
          source_value: extracted,
          ui_value,
          tolerance,
          difference,
          status: "SUCCESS",
          is_matched: isMatched,
          message: null,
        };
      }

      return {
        indicator_id,
        display_name,
        source_url,
        source_value: null,
        ui_value,
        tolerance,
        difference: null,
        status: "SKIPPED",
        is_matched: false,
        message:
          "No json_path or scrape_config provided — source is an HTML page.",
      };
    } catch {
      return {
        indicator_id,
        display_name,
        source_url,
        source_value: null,
        ui_value,
        tolerance,
        difference: null,
        status: "SKIPPED",
        is_matched: false,
        message:
          "No json_path or scrape_config provided — cannot extract value.",
      };
    }
  }

  // ── Fetch from source URL ─────────────────────────────────────────────
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(source_url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, application/xml, text/xml, text/csv, text/html, */*",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        indicator_id,
        display_name,
        source_url,
        source_value: null,
        ui_value,
        tolerance,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";

    // ── Check if the endpoint returned a PDF ───────────────────────────
    if (contentType.toLowerCase().includes("application/pdf")) {
      try {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const text = await extractPdfText(buffer);
        const extracted = extractValueFromPdfText(text, indicator);
        const { isMatched, difference } = compareValues(
          extracted,
          ui_value,
          tolerance
        );

        return {
          indicator_id,
          display_name,
          source_url,
          source_value: extracted,
          ui_value,
          tolerance,
          difference,
          status: "SUCCESS",
          is_matched: isMatched,
          message: null,
        };
      } catch (err: unknown) {
        return {
          indicator_id,
          display_name,
          source_url,
          source_value: null,
          ui_value,
          tolerance,
          difference: null,
          status: "ERROR",
          is_matched: false,
          message:
            err instanceof Error ? err.message : "Failed to extract PDF data.",
        };
      }
    }

    // Read response text
    const rawText = await response.text();

    // ── Check if the endpoint returned XML / RSS ───────────────────────
    const isXml =
      contentType.includes("xml") ||
      rawText.trim().startsWith("<?xml") ||
      rawText.includes("<rss") ||
      rawText.includes("<feed");

    if (isXml) {
      const itemCount = (
        rawText.match(/<item[\s>]/gi) || rawText.match(/<entry[\s>]/gi) || []
      ).length;
      const extracted = itemCount > 0 ? `Active (${itemCount} items)` : "Active";
      const isMatched =
        String(ui_value).toLowerCase() === "active" ||
        String(ui_value).toLowerCase().includes("active") ||
        itemCount > 0;

      return {
        indicator_id,
        display_name,
        source_url,
        source_value: extracted,
        ui_value,
        tolerance,
        difference: null,
        status: "SUCCESS",
        is_matched: isMatched,
        message: null,
      };
    }

    // ── Check if the endpoint returned CSV ─────────────────────────────
    const isCsv =
      contentType.includes("csv") ||
      source_url.toLowerCase().endsWith(".csv") ||
      source_url.includes("format=csv");

    if (isCsv) {
      const lines = rawText.trim().split("\n").filter((l) => l.trim().length > 0);
      let extracted: string | number = `Active (${lines.length} rows)`;

      // If ui_value is a number, try to parse the last non-empty line
      if (typeof ui_value === "number" && lines.length > 1) {
        const lastCols = lines[lines.length - 1].split(",");
        for (let i = lastCols.length - 1; i >= 0; i--) {
          const num = parseFloat(lastCols[i].trim());
          if (!isNaN(num)) {
            extracted = num;
            break;
          }
        }
      }

      const { isMatched, difference } = compareValues(
        extracted,
        ui_value,
        tolerance
      );

      return {
        indicator_id,
        display_name,
        source_url,
        source_value: extracted,
        ui_value,
        tolerance,
        difference,
        status: "SUCCESS",
        is_matched: isMatched || String(ui_value).toLowerCase() === "available",
        message: null,
      };
    }

    // ── Try to parse as JSON ───────────────────────────────────────────
    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      return {
        indicator_id,
        display_name,
        source_url,
        source_value: null,
        ui_value,
        tolerance,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message: "Response is not valid JSON.",
      };
    }

    // ── Extract value via json_path ───────────────────────────────────
    const extractedValue = resolveJsonPath(data, json_path!);

    if (extractedValue === undefined || extractedValue === null) {
      return {
        indicator_id,
        display_name,
        source_url,
        source_value: null,
        ui_value,
        tolerance,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message: `Value not found at json_path "${json_path}".`,
      };
    }

    // ── Compare ──────────────────────────────────────────────────────
    const { isMatched, difference } = compareValues(
      extractedValue,
      ui_value,
      tolerance
    );

    const sourceValue =
      typeof extractedValue === "string"
        ? extractedValue
        : Number(extractedValue);

    return {
      indicator_id,
      display_name,
      source_url,
      source_value: sourceValue,
      ui_value,
      tolerance,
      difference,
      status: "SUCCESS",
      is_matched: isMatched,
      message: null,
    };
  } catch (error: unknown) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s.`
        : error instanceof Error
          ? error.message
          : "Unknown fetch error.";

    return {
      indicator_id,
      display_name,
      source_url,
      source_value: null,
      ui_value,
      tolerance,
      difference: null,
      status: "ERROR",
      is_matched: false,
      message,
    };
  }
}
