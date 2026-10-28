import fs from "fs";
import path from "path";

export interface LiveSnapResource {
  value?: string | number | null;
  unit?: string | null;
  source?: string | null;
}

export interface LiveSnapProvince {
  country_code?: string;
  province?: string;
  resources?: Record<string, LiveSnapResource>;
  missing?: string[];
}

export interface LiveSnapCountry {
  country_code?: string;
  indicators?: Record<string, LiveSnapResource>;
}

export interface LiveSnapData {
  country?: Record<string, LiveSnapCountry>;
  province?: Record<string, LiveSnapProvince>;
  news?: Record<string, unknown>;
  taken?: string;
}

let cachedLiveSnap: LiveSnapData | null = null;
let cachedHtmlPath: string | null = null;

/**
 * Extracts and caches LIVE_SNAP data from RXBE_live_Template.html.
 */
export function loadLiveSnap(htmlPath?: string): LiveSnapData {
  const targetPath = htmlPath || path.resolve(process.cwd(), "helper/RXBE_live_Template.html");
  if (cachedLiveSnap && cachedHtmlPath === targetPath) {
    return cachedLiveSnap;
  }

  if (!fs.existsSync(targetPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(targetPath, "utf-8");
    const idx = content.indexOf("LIVE_SNAP = ");
    if (idx !== -1) {
      const endIdx = content.indexOf(";</script>", idx);
      const jsonStr = content.substring(idx + "LIVE_SNAP = ".length, endIdx !== -1 ? endIdx : undefined);
      cachedLiveSnap = JSON.parse(jsonStr) as LiveSnapData;
      cachedHtmlPath = targetPath;
      return cachedLiveSnap;
    }

    const snapMatch = content.match(/const LIVE_SNAP\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (snapMatch) {
      cachedLiveSnap = JSON.parse(snapMatch[1]) as LiveSnapData;
      cachedHtmlPath = targetPath;
      return cachedLiveSnap;
    }
  } catch (err) {
    console.error("Failed to parse LIVE_SNAP from HTML:", err);
  }

  return {};
}

/**
 * Resolves province resource value (lat, lon, display_name, ghi, wind, etc.)
 */
export function getProvinceResource(
  liveSnap: LiveSnapData,
  iso3: string,
  province: string,
  resourceKey: string
): string | number | null {
  const provMap = liveSnap.province || {};
  const directKey = `${iso3}|${province}`;

  let provRecord = provMap[directKey];
  if (!provRecord) {
    // Try fuzzy match on province name
    const matchKey = Object.keys(provMap).find((k) => {
      const parts = k.split("|");
      return (
        parts[0] === iso3 &&
        (parts[1]?.toLowerCase().includes(province.toLowerCase()) ||
          province.toLowerCase().includes(parts[1]?.toLowerCase() || ""))
      );
    });
    if (matchKey) {
      provRecord = provMap[matchKey];
    }
  }

  if (!provRecord || !provRecord.resources) {
    return null;
  }

  const res = provRecord.resources[resourceKey];
  if (!res || res.value === undefined || res.value === null) {
    return null;
  }

  const num = Number(res.value);
  return Number.isNaN(num) ? String(res.value) : num;
}

/**
 * Resolves country indicator value by key or aliases
 */
export function getCountryIndicator(
  liveSnap: LiveSnapData,
  iso3: string,
  indicatorKeys: string[]
): string | number | null {
  const countryObj = liveSnap.country?.[iso3];
  if (!countryObj || !countryObj.indicators) {
    return null;
  }

  const inds = countryObj.indicators;
  for (const key of indicatorKeys) {
    const item = inds[key];
    if (item && item.value !== undefined && item.value !== null) {
      const num = Number(item.value);
      return Number.isNaN(num) ? String(item.value) : num;
    }
  }

  return null;
}
