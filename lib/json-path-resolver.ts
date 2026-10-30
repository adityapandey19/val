const GSA_ALIASES: Record<string, string[]> = {
  pvout: ["PVOUT_csi", "pvout_csi", "pvout"],
  pvout_csi: ["PVOUT_csi", "pvout"],
  ghi: ["GHI", "ghi_annual", "annual_ghi", "ghi"],
  ghi_annual: ["GHI", "ghi"],
  annual_ghi: ["GHI", "ghi"],
  dni: ["DNI", "dni"],
  dif: ["DIF", "dif"],
  temp: ["TEMP", "temp"],
  temperature: ["TEMP", "temp"],
  opta: ["OPTA", "opta", "gti_opta", "GTI_opta"],
  gti_opta: ["GTI_opta", "gti", "opta", "OPTA"],
  gti: ["GTI_opta", "gti_opta", "opta"],
  ele: ["ELE", "ele", "elevation"],
  elevation: ["ELE", "ele"],
};

function tokenizePath(pathStr: string): string[] {
  const clean = pathStr.trim().replace(/^\$\.?/, "");
  const tokens: string[] = [];
  const regex = /\[(?:"([^"]+)"|'([^']+)'|([^\]]+))\]|([^.\[\]]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clean)) !== null) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (token) {
      tokens.push(token.trim());
    }
  }
  return tokens;
}

function lookupProperty(
  obj: Record<string, unknown>,
  token: string
): unknown | undefined {
  if (token in obj && obj[token] !== undefined) {
    return obj[token];
  }

  const low = token.toLowerCase();
  const caseKey = Object.keys(obj).find((k) => k.toLowerCase() === low);
  if (caseKey && obj[caseKey] !== undefined) {
    return obj[caseKey];
  }

  const aliases = GSA_ALIASES[low];
  if (aliases) {
    for (const a of aliases) {
      if (a in obj && obj[a] !== undefined) {
        return obj[a];
      }
      const aCase = Object.keys(obj).find(
        (k) => k.toLowerCase() === a.toLowerCase()
      );
      if (aCase && obj[aCase] !== undefined) {
        return obj[aCase];
      }
    }
  }

  return undefined;
}

/**
 * Resolves a single path token chain from a JSON object.
 */
function resolveSinglePath(data: unknown, pathStr: string): unknown | undefined {
  const tokens = tokenizePath(pathStr);
  if (tokens.length === 0) return undefined;

  let current: unknown = data;

  for (let i = 0; i < tokens.length; i++) {
    if (current === null || current === undefined) {
      return undefined;
    }

    const token = tokens[i];

    // Array indexing
    if (Array.isArray(current)) {
      const idx = Number(token);
      if (!Number.isNaN(idx) && idx >= 0 && idx < current.length) {
        current = current[idx];
        continue;
      }
      return undefined;
    }

    if (typeof current !== "object") {
      return undefined;
    }

    const obj = current as Record<string, unknown>;

    // 1. Direct or alias property lookup on current object
    const found = lookupProperty(obj, token);
    if (found !== undefined) {
      current = found;
      continue;
    }

    // 2. Global Solar Atlas format fallbacks at root level: { annual: { data: { ... } }, monthly: { ... } }
    if (i === 0 && obj.annual && typeof obj.annual === "object") {
      const ann = obj.annual as Record<string, unknown>;

      // If token is "data" and obj doesn't have data directly, delve into annual.data
      if (token.toLowerCase() === "data" && ann.data && typeof ann.data === "object") {
        current = ann.data;
        continue;
      }

      // If token matches inside annual.data
      if (ann.data && typeof ann.data === "object") {
        const d = ann.data as Record<string, unknown>;
        const low = token.toLowerCase();

        if (low === "daily_ghi" || low === "ghi_daily") {
          const ghi = lookupProperty(d, "GHI");
          if (ghi !== undefined) {
            current = parseFloat((Number(ghi) / 365).toFixed(2));
            continue;
          }
        }

        if (low === "daily_pvout" || low === "pvout_daily") {
          const pv = lookupProperty(d, "PVOUT_csi");
          if (pv !== undefined) {
            current = parseFloat((Number(pv) / 365).toFixed(2));
            continue;
          }
        }

        if (low === "cuf" || low === "solar_cuf") {
          const pv = lookupProperty(d, "PVOUT_csi");
          if (pv !== undefined) {
            current = parseFloat(((Number(pv) / (365 * 24)) * 100).toFixed(1));
            continue;
          }
        }

        const val = lookupProperty(d, token);
        if (val !== undefined) {
          current = val;
          continue;
        }
      }

      // If token matches inside annual.metadata
      if (ann.metadata && typeof ann.metadata === "object") {
        const val = lookupProperty(ann.metadata as Record<string, unknown>, token);
        if (val !== undefined) {
          current = val;
          continue;
        }
      }

      // If token matches inside monthly.data
      if (obj.monthly && typeof obj.monthly === "object") {
        const mon = obj.monthly as Record<string, unknown>;
        if (mon.data && typeof mon.data === "object") {
          const val = lookupProperty(mon.data as Record<string, unknown>, token);
          if (val !== undefined) {
            current = val;
            continue;
          }
        }
      }
    }

    // 3. Smart fallbacks on the final token
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
          keys[keys.length - 1];
        if (altKey && obj[altKey] !== undefined) {
          return obj[altKey];
        }
      }

      // Case C: Object has numeric values where keys are time periods (months/years)
      const isTimePeriodKey = (k: string) =>
        /^\d+$/.test(k) ||
        /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(k);

      const timeKeys = keys.filter(isTimePeriodKey);
      if (timeKeys.length > 0) {
        const numericValues = timeKeys
          .map((k) => Number(obj[k]))
          .filter((v) => !Number.isNaN(v));

        if (numericValues.length > 0) {
          const thirteenKey = timeKeys.find((k) => k.endsWith("13"));
          if (thirteenKey && obj[thirteenKey] !== undefined) {
            return obj[thirteenKey];
          }
          const sum = numericValues.reduce((a, b) => a + b, 0);
          return parseFloat((sum / numericValues.length).toFixed(4));
        }
      }
    }

    return undefined;
  }

  return current;
}

/**
 * Resolves a value from a JSON object using a path string.
 */
export function resolveJsonPath(
  data: unknown,
  path: string
): unknown | undefined {
  if (!path || typeof path !== "string") {
    return undefined;
  }

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
