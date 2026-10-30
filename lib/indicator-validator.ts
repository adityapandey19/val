import type { Indicator, IndicatorResult } from "./types";
import { resolveJsonPath } from "./json-path-resolver";
import { scrapeValue } from "./scraper";
import {
  isPdfTarget,
  scrapePdfValue,
  extractPdfText,
  extractValueFromPdfText,
} from "./pdf-extractor";
import { extractXmlValue, isXmlContent } from "./xml-extractor";

/** Timeout in milliseconds for fetching external APIs. */
const FETCH_TIMEOUT_MS = 25_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInternalSource(url: string): boolean {
  return url.startsWith("internal://");
}

function isXmlTarget(indicator: Indicator): boolean {
  if (indicator.xml_config) return true;
  if (indicator.source_type === "XML") return true;
  const url = (indicator.source_url || "").toLowerCase();
  const cat = (indicator.category || "").toLowerCase();
  const id = (indicator.indicator_id || "").toLowerCase();
  return (
    url.includes("/rss/") ||
    url.includes("/rss?") ||
    url.endsWith(".xml") ||
    url.includes(".xml?") ||
    url.includes("news.google.com/rss") ||
    cat.includes("rss") ||
    cat.includes("xml feed") ||
    cat === "xml" ||
    id.includes("xml_feed") ||
    id.includes("news_")
  );
}

/**
 * Extracts all numeric candidates from a string.
 * e.g. "1,982.09 kWh/m2/yr, shown as 5.43 kWh/m2/day" -> [1982.09, 5.43]
 */
function extractNumericCandidates(val: unknown): number[] {
  if (val === null || val === undefined) return [];
  if (typeof val === "number") return Number.isNaN(val) ? [] : [val];
  if (typeof val !== "string") return [];

  const candidates: number[] = [];
  // Match decimal or integer numbers (ignoring commas)
  const matches = val.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g);
  if (matches) {
    for (const m of matches) {
      const num = Number(m);
      if (!Number.isNaN(num)) {
        candidates.push(num);
      }
    }
  }
  return candidates;
}

function parseNumeric(val: unknown): number | null {
  if (val === null || val === undefined || typeof val === "boolean") {
    return null;
  }
  if (typeof val === "number") {
    return Number.isNaN(val) ? null : val;
  }
  if (typeof val === "string") {
    const cleaned = val
      .replace(/,/g, "")
      .replace(/%\s*$/, "")
      .trim();
    const num = Number(cleaned);
    if (!Number.isNaN(num)) return num;

    const candidates = extractNumericCandidates(val);
    if (candidates.length > 0) return candidates[0];
  }
  return null;
}

/**
 * Dual-mode comparison with support for composite UI strings
 * (e.g. "1,982.09 kWh/m2/yr, shown as 5.43 kWh/m2/day" matching either annual or daily).
 */
function compareValues(
  sourceValue: unknown,
  uiValue: number | string,
  tolerance: number
): { isMatched: boolean; difference: number | null } {
  const srcNum = parseNumeric(sourceValue);
  const uiCandidates = extractNumericCandidates(uiValue);

  // If source is numeric and UI has numeric candidates
  if (srcNum !== null && uiCandidates.length > 0) {
    for (const candidate of uiCandidates) {
      const diff = srcNum - candidate;
      const absDiff = Math.abs(diff);

      const absoluteMatch = absDiff <= tolerance;
      const relativeMatch = candidate !== 0 && Math.abs(diff / candidate) <= tolerance;

      if (absoluteMatch || relativeMatch) {
        return { isMatched: true, difference: parseFloat(diff.toFixed(6)) };
      }
    }

    // Default difference to first candidate
    const diff = srcNum - uiCandidates[0];
    return { isMatched: false, difference: parseFloat(diff.toFixed(6)) };
  }

  // String comparison (normalized)
  const srcStr = String(sourceValue ?? "").trim().toLowerCase();
  const uiStr = String(uiValue ?? "").trim().toLowerCase();

  const isMatched =
    srcStr === uiStr ||
    (srcStr.length > 0 && uiStr.includes(srcStr)) ||
    (uiStr.length > 0 && srcStr.includes(uiStr));

  return { isMatched, difference: null };
}

// ---------------------------------------------------------------------------
// Core validator
// ---------------------------------------------------------------------------

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
    screen_section,
    where_it_shows,
    is_reachability,
  } = indicator;

  const baseResult = {
    indicator_id,
    display_name,
    source_url,
    ui_value,
    tolerance,
    screen_section,
    where_it_shows,
    is_reachability,
  };

  // ── Skip: internal source ─────────────────────────────────────────────
  if (isInternalSource(source_url)) {
    return {
      ...baseResult,
      source_value: null,
      difference: null,
      status: "SKIPPED",
      is_matched: false,
      message: "Internal source — nothing to fetch.",
    };
  }

  // ── Reachability Check ────────────────────────────────────────────────
  // For rows with empty key/value or explicitly marked as REACHABILITY
  if (
    is_reachability ||
    indicator.source_type === "REACHABILITY" ||
    (String(ui_value).toLowerCase().includes("reachable") && !json_path)
  ) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const res = await fetch(source_url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
      });

      clearTimeout(timeoutId);

      const isOk = res.status >= 200 && res.status < 400;
      return {
        ...baseResult,
        source_value: `Reachable (HTTP ${res.status})`,
        difference: null,
        status: isOk ? "SUCCESS" : "ERROR",
        is_matched: isOk,
        message: isOk ? null : `HTTP status ${res.status} ${res.statusText}`,
        is_reachability: true,
      };
    } catch (err) {
      return {
        ...baseResult,
        source_value: null,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message: err instanceof Error ? err.message : "Failed to reach source URL.",
        is_reachability: true,
      };
    }
  }

  const hasJsonPath = json_path !== null && json_path !== undefined && json_path !== "";
  const scrapeConfig = indicator.scrape_config;

  // ── Route 1: PDF Target ───────────────────────────────────────────────
  if (isPdfTarget(source_url, null, scrapeConfig)) {
    try {
      const extracted = await scrapePdfValue(source_url, indicator);
      const { isMatched, difference } = compareValues(
        extracted,
        ui_value,
        tolerance
      );

      return {
        ...baseResult,
        source_value: extracted,
        difference,
        status: "SUCCESS",
        is_matched: isMatched,
        message: null,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown PDF extraction error.";
      return {
        ...baseResult,
        source_value: null,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message,
      };
    }
  }

  // ── Route 2: XML / RSS Target ───────────────────────────────────────────
  if (isXmlTarget(indicator)) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(source_url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "application/rss+xml, application/xml, text/xml, application/atom+xml, text/html, */*",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          ...baseResult,
          source_value: null,
          difference: null,
          status: "ERROR",
          is_matched: false,
          message: `HTTP ${response.status} ${response.statusText}`,
        };
      }

      const xmlText = await response.text();
      const extracted = extractXmlValue(xmlText, indicator.xml_config, ui_value);
      const { isMatched, difference } = compareValues(
        extracted,
        ui_value,
        tolerance
      );

      return {
        ...baseResult,
        source_value: extracted,
        difference,
        status: "SUCCESS",
        is_matched:
          isMatched ||
          String(ui_value).toLowerCase().includes("active") ||
          (typeof extracted === "string" && extracted.startsWith("Active")),
        message: null,
      };
    } catch (error: unknown) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? `XML fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s.`
          : error instanceof Error
            ? error.message
            : "Unknown XML extraction error.";

      return {
        ...baseResult,
        source_value: null,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message,
      };
    }
  }

  // ── Route 3: HTML Scrape Config ────────────────────────────────────────
  if (!hasJsonPath && scrapeConfig) {
    try {
      const scraped = await scrapeValue(source_url, scrapeConfig);
      const { isMatched, difference } = compareValues(
        scraped,
        ui_value,
        tolerance
      );

      return {
        ...baseResult,
        source_value: scraped,
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
        ...baseResult,
        source_value: null,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message,
      };
    }
  }

  // ── Route 4: API / JSON / CSV / Fallback Fetch ─────────────────────────
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
        ...baseResult,
        source_value: null,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";

    // Dynamic PDF response
    if (contentType.toLowerCase().includes("application/pdf")) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const text = await extractPdfText(buffer);
      const extracted = extractValueFromPdfText(text, indicator);
      const { isMatched, difference } = compareValues(extracted, ui_value, tolerance);

      return {
        ...baseResult,
        source_value: extracted,
        difference,
        status: "SUCCESS",
        is_matched: isMatched,
        message: null,
      };
    }

    const rawText = await response.text();

    // Dynamic XML response
    if (isXmlContent(contentType, rawText)) {
      const extracted = extractXmlValue(rawText, indicator.xml_config, ui_value);
      const { isMatched, difference } = compareValues(extracted, ui_value, tolerance);
      return {
        ...baseResult,
        source_value: extracted,
        difference,
        status: "SUCCESS",
        is_matched: isMatched,
        message: null,
      };
    }

    // CSV response (e.g. US Treasury daily rates)
    const isCsv =
      contentType.includes("csv") ||
      source_url.toLowerCase().endsWith(".csv") ||
      source_url.includes("format=csv") ||
      indicator.source_type === "CSV";

    if (isCsv) {
      const lines = rawText.trim().split("\n").filter((l) => l.trim().length > 0);
      let extracted: string | number = `Active (${lines.length} rows)`;

      if (lines.length > 1) {
        const headerCols = lines[0].split(",").map((c) => c.replace(/"/g, "").trim());
        const tenYrIndex = headerCols.findIndex(
          (h) => /10\s*yr/i.test(h) || /10-year/i.test(h)
        );

        const latestCols = lines[1].split(",").map((c) => c.replace(/"/g, "").trim());
        if (tenYrIndex !== -1 && latestCols[tenYrIndex]) {
          const val = parseFloat(latestCols[tenYrIndex]);
          if (!isNaN(val)) {
            extracted = val;
          }
        } else {
          // Last column number
          for (let i = latestCols.length - 1; i >= 0; i--) {
            const num = parseFloat(latestCols[i]);
            if (!isNaN(num)) {
              extracted = num;
              break;
            }
          }
        }
      }

      const { isMatched, difference } = compareValues(extracted, ui_value, tolerance);
      return {
        ...baseResult,
        source_value: extracted,
        difference,
        status: "SUCCESS",
        is_matched: isMatched || String(ui_value).toLowerCase() === "available",
        message: null,
      };
    }

    // JSON response
    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      // If no json_path and couldn't parse as JSON, check reachability
      if (!hasJsonPath) {
        return {
          ...baseResult,
          source_value: `Reachable (HTTP ${response.status})`,
          difference: null,
          status: "SUCCESS",
          is_matched: true,
          message: null,
          is_reachability: true,
        };
      }
      return {
        ...baseResult,
        source_value: null,
        difference: null,
        status: "ERROR",
        is_matched: false,
        message: "Response is not valid JSON.",
      };
    }

    // Extract value via json_path
    if (hasJsonPath) {
      const extractedValue = resolveJsonPath(data, json_path!);
      if (extractedValue === undefined || extractedValue === null) {
        return {
          ...baseResult,
          source_value: null,
          difference: null,
          status: "ERROR",
          is_matched: false,
          message: `Value not found at json_path "${json_path}".`,
        };
      }

      const { isMatched, difference } = compareValues(extractedValue, ui_value, tolerance);
      const sourceValue =
        typeof extractedValue === "string" ? extractedValue : Number(extractedValue);

      return {
        ...baseResult,
        source_value: sourceValue,
        difference,
        status: "SUCCESS",
        is_matched: isMatched,
        message: null,
      };
    }

    return {
      ...baseResult,
      source_value: null,
      difference: null,
      status: "SKIPPED",
      is_matched: false,
      message: "No json_path or scrape_config provided.",
    };
  } catch (error: unknown) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s.`
        : error instanceof Error
          ? error.message
          : "Unknown fetch error.";

    return {
      ...baseResult,
      source_value: null,
      difference: null,
      status: "ERROR",
      is_matched: false,
      message,
    };
  }
}
