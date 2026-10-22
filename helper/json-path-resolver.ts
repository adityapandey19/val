/**
 * Resolves a single path token chain from a JSON object.
 */
function resolveSinglePath(data: unknown, pathStr: string): unknown | undefined {
  // Strip optional root prefix '$' or '$.'
  const cleanPath = pathStr.trim().replace(/^\$\.?/, "");

  // Tokenize the path into individual keys / indices:
  // "[1][0].value"                                    → ["1", "0", "value"]
  // "rates.PGK"                                       → ["rates", "PGK"]
  // "properties.parameter.ALLSKY_SFC_SW_DWN.202513"   → ["properties", "parameter", "ALLSKY_SFC_SW_DWN", "202513"]
  const tokens = cleanPath
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

  let current: unknown = data;

  for (let i = 0; i < tokens.length; i++) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }

    const token = tokens[i];
    const obj = current as Record<string, unknown>;

    if (token in obj && obj[token] !== undefined) {
      current = obj[token];
      continue;
    }

    // ── Smart Fallbacks on the final token ──────────────────────────────
    if (i === tokens.length - 1) {
      const keys = Object.keys(obj);

      // Case A: Token is "ANN" or "annual", but data uses "YYYY13" (NASA POWER annual format)
      if (token.toUpperCase() === "ANN" || token.toLowerCase() === "annual") {
        const annKey =
          keys.find((k) => k.endsWith("13")) ||
          keys.find((k) => k.toLowerCase() === "ann") ||
          keys.find((k) => k.toLowerCase() === "annual");
        if (annKey && obj[annKey] !== undefined) {
          return obj[annKey];
        }
      }

      // Case B: Token is "YYYY13" (e.g. "202513"), but data uses "ANN" or another year's "13"
      if (token.endsWith("13") || /^\d{6}$/.test(token)) {
        const altKey =
          keys.find((k) => k.toLowerCase() === "ann") ||
          keys.find((k) => k.endsWith("13")) ||
          keys[keys.length - 1]; // or the latest month
        if (altKey && obj[altKey] !== undefined) {
          return obj[altKey];
        }
      }

      // Case C: Object has numeric values (e.g. monthly dictionary)
      const numericValues = keys
        .map((k) => Number(obj[k]))
        .filter((v) => !Number.isNaN(v));

      if (numericValues.length > 0) {
        // If an annual (13th) value exists
        const thirteenKey = keys.find((k) => k.endsWith("13"));
        if (thirteenKey && obj[thirteenKey] !== undefined) {
          return obj[thirteenKey];
        }
        // Otherwise mean of months
        const sum = numericValues.reduce((a, b) => a + b, 0);
        return parseFloat((sum / numericValues.length).toFixed(4));
      }
    }

    return undefined;
  }

  return current;
}

/**
 * Resolves a value from a JSON object using a path string.
 *
 * Supported path formats:
 *  - Multiple alternative paths separated by `||`, `|`, or `;`
 *    Example: `"properties.parameter.ALLSKY_SFC_SW_DWN.202513 || properties.parameter.ALLSKY_SFC_SW_DWN.ANN"`
 *  - Bracket notation:  `[1][0].value`, `$[1][0].value`
 *  - Dot notation:      `rates.PGK`, `properties.parameter.ALLSKY_SFC_SW_DWN.202513`
 *  - Month/ANN keys:    `202513`, `ANN`
 *  - Mixed:             `[1][0].date`
 *
 * Returns `undefined` when no path can be resolved.
 */
export function resolveJsonPath(
  data: unknown,
  path: string
): unknown | undefined {
  if (!path || typeof path !== "string") {
    return undefined;
  }

  // Split multiple alternative paths separated by '||', '|', or ';'
  const candidatePaths = path
    .split(/\s*\|\|\s*|\s*\|\s*|\s*;\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const candidate of candidatePaths) {
    const resolved = resolveSinglePath(data, candidate);
    if (resolved !== undefined && resolved !== null) {
      return resolved;
    }
  }

  return undefined;
}
