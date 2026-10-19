import type { Indicator, IndicatorResult } from "./types";
import { resolveJsonPath } from "./json-path-resolver";

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

  // ── Skip: no json_path ────────────────────────────────────────────────
  if (json_path === null || json_path === undefined || json_path === "") {
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
        "No json_path provided — source is likely an HTML page or PDF.",
    };
  }

  // ── Fetch from source URL ─────────────────────────────────────────────
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(source_url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
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

    // Try to parse as JSON
    let data: unknown;
    try {
      data = await response.json();
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
    const extractedValue = resolveJsonPath(data, json_path);

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
