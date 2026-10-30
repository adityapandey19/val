import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import type { Indicator } from "@/lib/types";
import { generateScrapeConfig } from "@/lib/scrape-config-generator";
import { getCountryConfig, type CountryConfig } from "@/lib/country-config";
import { loadLiveSnap, getProvinceResource } from "@/lib/livesnap-resolver";

export interface WizardStep3ExcelRow {
  "Screen Section"?: string;
  "Wizard Field"?: string;
  "Source Category"?: string;
  "Source URL"?: string;
  "Source Type"?: string;
  "Platform indicator key"?: string;
  "Value in platform DB now (PNG)"?: string | number;
  "Where it shows"?: string;
  [key: string]: unknown;
}

export interface ParseStep3Options {
  excelPath?: string;
  sheetName?: string;
  countryCode?: string;
  province?: string;
  htmlPath?: string;
}

/**
 * Normalizes Step 3 URL for country, province, and site coordinates
 */
function templateStep3SourceUrl(
  rawUrl: string,
  countryCfg: CountryConfig,
  lat: number,
  lon: number,
  province: string
): string {
  let url = (rawUrl || "").trim();
  if (url === "-" || !url) return url;

  // 1. World Bank API: country replacement
  url = url.replace(
    /api\.worldbank\.org\/v2\/country\/[A-Z]{2}\/indicator/i,
    `api.worldbank.org/v2/country/${countryCfg.wb_country_code}/indicator`
  );

  // 2. OpenStreetMap Nominatim: geocoding query replacement
  if (url.includes("nominatim.openstreetmap.org")) {
    const query = encodeURIComponent(`${province},${countryCfg.country}`);
    url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
  }

  // 3. Global Solar Atlas: coordinate replacement
  if (url.includes("globalsolaratlas.info")) {
    url = `https://api.globalsolaratlas.info/data/lta?loc=${lat.toFixed(4)},${lon.toFixed(4)}`;
  }

  // 4. Global Wind Atlas: coordinate and area replacement
  if (url.includes("globalwindatlas.info")) {
    const encCountry = encodeURIComponent(countryCfg.country);
    const encProvince = encodeURIComponent(province);
    url = `https://globalwindatlas.info/en/area/${encCountry}/${encProvince}?point=${lon.toFixed(4)},${lat.toFixed(4)}#wind-speed`;
  }

  return url;
}

/**
 * Parses Wizard Step 3 Excel rows into standardized Indicators.
 * - Retains all rows (no deduplication, Option A)
 * - Treats empty platform key rows as URL Reachability checks (Option A)
 */
export function parseWizardStep3Rows(
  rows: WizardStep3ExcelRow[],
  countryCfg: CountryConfig,
  province: string,
  lat: number,
  lon: number
): Indicator[] {
  const indicators: Indicator[] = [];

  rows.forEach((row, index) => {
    const screenSection = String(row["Screen Section"] || "").trim();
    const wizardField = String(row["Wizard Field"] || "").trim();
    const sourceCategory = String(row["Source Category"] || "").trim();
    const rawUrl = String(row["Source URL"] || "").trim();
    const rawSourceType = String(row["Source Type"] || "").trim();
    const rawPlatformKey = row["Platform indicator key"] !== undefined && row["Platform indicator key"] !== null
      ? String(row["Platform indicator key"]).trim()
      : "";
    const rawValueInDb = row["Value in platform DB now (PNG)"];
    const whereItShows = row["Where it shows"] ? String(row["Where it shows"]).trim() : "";

    const rowNum = index + 1;
    const templatedUrl = templateStep3SourceUrl(rawUrl, countryCfg, lat, lon, province);

    // Option (a): Empty Platform indicator key -> URL reachability check
    const isEmptyKey = !rawPlatformKey || rawPlatformKey === "-" || rawPlatformKey === "undefined";
    const isEmptyValue = rawValueInDb === undefined || rawValueInDb === null || String(rawValueInDb).trim() === "";

    if (isEmptyKey || isEmptyValue) {
      indicators.push({
        indicator_id: `reachability_step3_row_${rowNum}`,
        display_name: `${wizardField || "Evidence Verification"} (Row ${rowNum})`,
        category: sourceCategory || "Land Tenure & Legal Risk",
        source_url: templatedUrl,
        json_path: null,
        ui_value: "Reachable URL",
        unit: "status",
        tolerance: 0,
        source_type: "REACHABILITY",
        screen_section: screenSection,
        where_it_shows: whereItShows,
        is_reachability: true,
      });
      return;
    }

    // Standard Step 3 Indicator with unique row ID (retaining duplicates per Option A)
    const indicatorId = `${rawPlatformKey.toLowerCase().replace(/[^a-z0-9_]/g, "_")}_row_${rowNum}`;
    let jsonPath: string | null = null;
    let scrapeConfig = null;
    let tolerance = 0.05;
    let unit = "";
    let sourceTypeDesc: "API" | "PDF" | "SCRAPE" | "CSV" = "API";

    const uiValueStr = String(rawValueInDb).trim();

    // Source Type routing
    if (rawSourceType.toLowerCase().includes("scrape")) {
      sourceTypeDesc = "SCRAPE";
      scrapeConfig = generateScrapeConfig({
        field: wizardField,
        category: sourceCategory,
        url: rawUrl,
        countryName: countryCfg.country,
      });
      tolerance = 0.1;
    } else if (rawSourceType.toLowerCase().includes("pdf") || templatedUrl.toLowerCase().endsWith(".pdf")) {
      sourceTypeDesc = "PDF";
      scrapeConfig = { content_type: "pdf" as const };
      tolerance = 0.5;
    } else if (templatedUrl.includes("format=csv") || templatedUrl.endsWith(".csv")) {
      sourceTypeDesc = "CSV";
      tolerance = 0.5;
    } else {
      // API
      sourceTypeDesc = "API";
      if (templatedUrl.includes("globalsolaratlas.info")) {
        if (rawPlatformKey === "ghi") {
          jsonPath = "annual.data.GHI || ghi";
          tolerance = 5.0;
          unit = "kWh/m²";
        } else if (rawPlatformKey === "pvout") {
          jsonPath = "annual.data.PVOUT_csi || pvout";
          tolerance = 5.0;
          unit = "kWh/kWp";
        }
      } else if (templatedUrl.includes("worldbank.org")) {
        jsonPath = "[1][0].value";
        tolerance = 0.1;
      } else if (templatedUrl.includes("nominatim.openstreetmap.org")) {
        jsonPath = "[0].lat";
        tolerance = 0.05;
        unit = "deg";
      }
    }

    indicators.push({
      indicator_id: indicatorId,
      display_name: `${wizardField} (${sourceCategory})`,
      category: sourceCategory,
      source_url: templatedUrl,
      json_path: jsonPath,
      ui_value: uiValueStr,
      unit,
      tolerance,
      ...(scrapeConfig ? { scrape_config: scrapeConfig } : {}),
      source_type: sourceTypeDesc,
      screen_section: screenSection,
      where_it_shows: whereItShows,
      is_reachability: false,
    });
  });

  return indicators;
}

/**
 * Main parser entry point for Step 3 workbooks.
 */
export function parseStep3ExcelSources(options?: ParseStep3Options): Indicator[] {
  const defaultBaseline = path.resolve(process.cwd(), "app/step_3/lib/RXBE_Wizard_Step3_Sources_UI_Only.xlsx");
  const excelPath = options?.excelPath || defaultBaseline;

  const countryCode = options?.countryCode || "PG";
  const countryCfg = getCountryConfig(countryCode);
  const province = options?.province || countryCfg.default_province;

  // Resolve coordinates
  const defaultHtml = path.resolve(process.cwd(), "lib/RXBE_live_Template.html");
  const htmlPath = options?.htmlPath || defaultHtml;
  const liveSnap = loadLiveSnap(htmlPath);
  const snapLat = getProvinceResource(liveSnap, countryCfg.iso3, province, "lat", countryCfg.country);
  const snapLon = getProvinceResource(liveSnap, countryCfg.iso3, province, "lon", countryCfg.country);
  const lat = typeof snapLat === "number" ? snapLat : countryCfg.coordinates.latitude;
  const lon = typeof snapLon === "number" ? snapLon : countryCfg.coordinates.longitude;

  if (!fs.existsSync(excelPath)) {
    throw new Error(`Step 3 Excel source file not found at: ${excelPath}`);
  }

  const fileBuffer = fs.readFileSync(excelPath);
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName =
    options?.sheetName && wb.SheetNames.includes(options.sheetName)
      ? options.sheetName
      : wb.SheetNames[0];

  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<WizardStep3ExcelRow>(sheet);
  return parseWizardStep3Rows(rows, countryCfg, province, lat, lon);
}
