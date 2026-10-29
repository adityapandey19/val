/**
 * Dual-mode Tolerance Comparison Engine
 * Supports exact string equality and dual-mode (absolute + relative) numeric comparison.
 */

export interface ComparisonResult {
  readonly isMatched: boolean;
  readonly difference: number | null;
  readonly matchType: "EXACT_STRING" | "ABSOLUTE_NUMERIC" | "RELATIVE_NUMERIC" | "MISMATCH";
}

export function compareValuesWithTolerance(
  sourceValue: unknown,
  uiValue: number | string,
  tolerance: number
): ComparisonResult {
  // String comparison
  if (typeof uiValue === "string" || typeof sourceValue === "string") {
    const srcStr = String(sourceValue ?? "").trim().toLowerCase();
    const uiStr = String(uiValue ?? "").trim().toLowerCase();
    const isMatched = srcStr === uiStr;
    return {
      isMatched,
      difference: null,
      matchType: isMatched ? "EXACT_STRING" : "MISMATCH",
    };
  }

  // Numeric comparison
  const srcNum = Number(sourceValue);
  const uiNum = Number(uiValue);

  if (Number.isNaN(srcNum) || Number.isNaN(uiNum)) {
    return {
      isMatched: false,
      difference: null,
      matchType: "MISMATCH",
    };
  }

  const diff = srcNum - uiNum;
  const absDiff = Math.abs(diff);

  // Mode 1: Absolute tolerance — |diff| <= tolerance
  if (absDiff <= tolerance) {
    return {
      isMatched: true,
      difference: parseFloat(diff.toFixed(10)),
      matchType: "ABSOLUTE_NUMERIC",
    };
  }

  // Mode 2: Relative tolerance — |diff / ui_value| <= tolerance
  if (uiNum !== 0 && Math.abs(diff / uiNum) <= tolerance) {
    return {
      isMatched: true,
      difference: parseFloat(diff.toFixed(10)),
      matchType: "RELATIVE_NUMERIC",
    };
  }

  return {
    isMatched: false,
    difference: parseFloat(diff.toFixed(10)),
    matchType: "MISMATCH",
  };
}
