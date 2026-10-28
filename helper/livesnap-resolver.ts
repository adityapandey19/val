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

export interface TemplateCountry {
  iso?: string;
  utility?: string;
  tariff?: number;
  tax?: number;
  gcf?: string;
  taxNote?: string;
  [key: string]: unknown;
}

export interface TemplateProvince {
  ghi?: number;
  wind?: number;
  hydro?: string;
  biomass?: string;
  cuf?: number;
  plf?: number;
  note?: string;
  [key: string]: unknown;
}

export interface LiveSnapData {
  country?: Record<string, LiveSnapCountry>;
  province?: Record<string, LiveSnapProvince>;
  news?: Record<string, { country_code?: string; news?: Array<{ topic?: string; headline?: string; source?: string; url?: string | null }> }>;
  taken?: string;
  templateData?: {
    countries?: string[];
    country?: Record<string, TemplateCountry>;
    provinces?: Record<string, Record<string, TemplateProvince>>;
    [key: string]: unknown;
  };
}

let cachedLiveSnap: LiveSnapData | null = null;
let cachedHtmlPath: string | null = null;

/**
 * Extracts and caches LIVE_SNAP data and embedded template #data from RXBE_live_Template.html.
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
    let result: LiveSnapData = {};

    // 1. Parse const LIVE_SNAP = {...};
    const idx = content.indexOf("LIVE_SNAP = ");
    if (idx !== -1) {
      const endIdx = content.indexOf(";</script>", idx);
      const jsonStr = content.substring(idx + "LIVE_SNAP = ".length, endIdx !== -1 ? endIdx : undefined);
      result = JSON.parse(jsonStr) as LiveSnapData;
    } else {
      const snapMatch = content.match(/const LIVE_SNAP\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
      if (snapMatch) {
        result = JSON.parse(snapMatch[1]) as LiveSnapData;
      }
    }

    // 2. Parse <script id="data" type="application/json">
    const dataMatch = content.match(/<script id=["']data["'] type=["']application\/json["']>([\s\S]*?)<\/script>/);
    if (dataMatch) {
      try {
        result.templateData = JSON.parse(dataMatch[1]);
      } catch {
        // Ignore template data parse error
      }
    }

    cachedLiveSnap = result;
    cachedHtmlPath = targetPath;
    return cachedLiveSnap;
  } catch (err) {
    console.error("Failed to parse LIVE_SNAP or template data from HTML:", err);
  }

  return {};
}

/**
 * Resolves province resource value (lat, lon, display_name, ghi, wind, etc.)
 * Checks LIVE_SNAP first, then falls back to template #data.
 */
export function getProvinceResource(
  liveSnap: LiveSnapData,
  iso3: string,
  province: string,
  resourceKey: string,
  countryName?: string
): string | number | null {
  const provMap = liveSnap.province || {};
  const directKey = `${iso3}|${province}`;

  let provRecord = provMap[directKey];
  if (!provRecord) {
    // Try fuzzy match on province name in LIVE_SNAP
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

  if (provRecord && provRecord.resources) {
    const res = provRecord.resources[resourceKey];
    if (res && res.value !== undefined && res.value !== null) {
      const num = Number(res.value);
      return Number.isNaN(num) ? String(res.value) : num;
    }
  }

  // Fallback to templateData.provinces
  const tProvs = liveSnap.templateData?.provinces;
  if (tProvs) {
    const cKey = Object.keys(tProvs).find((k) =>
      countryName ? k.toLowerCase() === countryName.toLowerCase() : false
    );
    if (cKey && tProvs[cKey]) {
      const pKey = Object.keys(tProvs[cKey]).find(
        (pk) =>
          pk.toLowerCase().includes(province.toLowerCase()) ||
          province.toLowerCase().includes(pk.toLowerCase())
      );
      if (pKey && tProvs[cKey][pKey]) {
        const val = tProvs[cKey][pKey][resourceKey as keyof TemplateProvince];
        if (val !== undefined && val !== null) {
          return val as string | number;
        }
      }
    }
  }

  return null;
}

/**
 * Resolves country indicator value by key or aliases.
 * Checks LIVE_SNAP first, then falls back to template #data.
 */
export function getCountryIndicator(
  liveSnap: LiveSnapData,
  iso3: string,
  indicatorKeys: string[],
  countryName?: string
): string | number | null {
  const countryObj = liveSnap.country?.[iso3];
  if (countryObj && countryObj.indicators) {
    const inds = countryObj.indicators;
    for (const key of indicatorKeys) {
      const item = inds[key];
      if (item && item.value !== undefined && item.value !== null) {
        const num = Number(item.value);
        return Number.isNaN(num) ? String(item.value) : num;
      }
    }
  }

  // Fallback to templateData.country
  const tCountryMap = liveSnap.templateData?.country;
  if (tCountryMap) {
    let tCountry: TemplateCountry | undefined;
    if (countryName && tCountryMap[countryName]) {
      tCountry = tCountryMap[countryName];
    } else {
      // Find by iso
      const match = Object.values(tCountryMap).find((c) => c.iso === iso3);
      if (match) tCountry = match;
    }

    if (tCountry) {
      for (const k of indicatorKeys) {
        const lower = k.toLowerCase();
        if (lower.includes("tariff") && tCountry.tariff !== undefined) {
          return tCountry.tariff;
        }
        if ((lower.includes("tax") || lower.includes("corporate")) && tCountry.tax !== undefined) {
          return tCountry.tax;
        }
        if (lower.includes("utility") && tCountry.utility !== undefined) {
          return tCountry.utility;
        }
        if (lower.includes("gcf") && tCountry.gcf !== undefined) {
          return tCountry.gcf;
        }
      }
    }
  }

  return null;
}
