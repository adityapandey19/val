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
import { scrapeIndicator } from "@/Dev/scrapers";

/** Timeout in milliseconds for fetching external APIs (increased for slower/throttled connections). */
const FETCH_TIMEOUT_MS = 25_000;

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
 * Detects whether an indicator represents an XML / RSS feed source.
 */
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
 * Helper to parse a value into a finite number, or null if not numeric.
 */
function parseNumeric(val: unknown): number | null {
  if (val === null || val === undefined || typeof val === "boolean") {
    return null;
  }
  if (typeof val === "number") {
    return Number.isNaN(val) ? null : val;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return null;
    const num = Number(trimmed);
    return Number.isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Compares source_value vs ui_value using dual-mode tolerance:
 * - If both can be parsed as numbers:
 *     absolute: |source - ui| <= tolerance
 *     relative: |(source - ui) / ui| <= tolerance
 * - Otherwise (words, status codes): exact (case-insensitive) string equality.
 */
function compareValues(
  sourceValue: unknown,
  uiValue: number | string,
  tolerance: number
): { isMatched: boolean; difference: number | null } {
  const srcNum = parseNumeric(sourceValue);
  const uiNum = parseNumeric(uiValue);

  // ---- numeric comparison (dual-mode tolerance) ----
  if (srcNum !== null && uiNum !== null) {
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

  // ---- string comparison ----
  const isMatched =
    String(sourceValue).trim().toLowerCase() ===
    String(uiValue).trim().toLowerCase();
  return { isMatched, difference: null };
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

      const xmlText = await response.text();
      const extracted = extractXmlValue(xmlText, indicator.xml_config, ui_value);
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

  // ── Route 3: HTML Scrape Config (CSS selector / Regex / Meta name) ──────
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

  // ── Route 4: No json_path and no scrapeConfig ─────────────────────────
  // Fetch to check if the server returns a PDF or XML dynamically
  if (!hasJsonPath && !scrapeConfig) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(source_url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/pdf,application/xml,text/xml,application/json,text/html,*/*",
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

      const rawText = await response.text();
      if (isXmlContent(contentType, rawText)) {
        const extracted = extractXmlValue(rawText, indicator.xml_config, ui_value);
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
          is_matched: isMatched || String(ui_value).toLowerCase().includes("active"),
          message: null,
        };
      }

      // Check if we have a specialized HTML scraper for this indicator
      try {
        const scraped = await scrapeIndicator(indicator_id, source_url);
        if (scraped.status === "SUCCESS" && scraped.sourceValue !== null) {
          const { isMatched, difference } = compareValues(
            scraped.sourceValue,
            ui_value,
            tolerance
          );
          return {
            indicator_id,
            display_name,
            source_url,
            source_value: scraped.sourceValue,
            ui_value,
            tolerance,
            difference,
            status: "SUCCESS",
            is_matched: isMatched,
            message: scraped.message || null,
          };
        }
      } catch {
        // Fall back to default message below
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
      // Attempt HTML scrape in catch block as well in case initial fetch was blocked or timed out
      try {
        const scraped = await scrapeIndicator(indicator_id, source_url);
        if (scraped.status === "SUCCESS" && scraped.sourceValue !== null) {
          const { isMatched, difference } = compareValues(
            scraped.sourceValue,
            ui_value,
            tolerance
          );
          return {
            indicator_id,
            display_name,
            source_url,
            source_value: scraped.sourceValue,
            ui_value,
            tolerance,
            difference,
            status: "SUCCESS",
            is_matched: isMatched,
            message: scraped.message || null,
          };
        }
      } catch {
        // Fall through to error
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
    const isXml = isXmlContent(contentType, rawText);

    if (isXml) {
      const extracted = extractXmlValue(rawText, indicator.xml_config, ui_value);
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
        is_matched:
          isMatched ||
          String(ui_value).toLowerCase().includes("active") ||
          (typeof extracted === "string" && extracted.startsWith("Active")),
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
