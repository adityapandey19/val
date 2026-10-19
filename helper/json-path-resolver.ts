/**
 * Resolves a value from a JSON object using a path string.
 *
 * Supported path formats:
 *  - Bracket notation:  `[1][0].value`
 *  - Dot notation:      `rates.PGK`
 *  - Simple key:        `ghi`
 *  - Mixed:             `[1][0].date`
 *
 * Returns `undefined` when the path cannot be fully resolved.
 */
export function resolveJsonPath(
  data: unknown,
  path: string
): unknown | undefined {
  // Tokenize the path into individual keys / indices.
  // "[1][0].value"  → ["1", "0", "value"]
  // "rates.PGK"     → ["rates", "PGK"]
  // "ghi"           → ["ghi"]
  const tokens = path
    .replace(/\[(\w+)\]/g, ".$1") // convert bracket notation to dot notation
    .split(".")
    .filter(Boolean); // remove empty strings from leading dots

  let current: unknown = data;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== "object") {
      return undefined;
    }

    // `current` is a non-null object (or array). Access by key/index.
    current = (current as Record<string, unknown>)[token];
  }

  return current;
}
