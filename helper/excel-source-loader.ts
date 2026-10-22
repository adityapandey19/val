import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import type { Indicator } from "./types";
import { buildPdfIndicators } from "./validate-pdf-sources";

const EXCEL_PATH = path.resolve(process.cwd(), "helper/RXBE_PNG_AllSources_081026.xlsx");
const HTML_PATH = path.resolve(process.cwd(), "helper/RXBE_live_Template.html");
const REQ_JSON_PATH = path.resolve(process.cwd(), "helper/request_json_example.json");

interface ExcelRow {
  "#": number;
  "AI Layer": string;
  Category: string;
  "Country / Scope": string;
  URL: string;
  "Data Points to Capture": string;
  "Access Type": string;
  "Update Frequency"?: string;
  "Integration Notes"?: string;
  Working?: string;
  [key: string]: unknown;
}

/**
 * Loads the 112 structured API indicators from RXBE_PNG_AllSources_081026.xlsx:
 *  - Free API (JSON): 78
 *  - Free API: 21
 *  - XML: 10
 *  - Free API (CSV): 3
 * Total = 112 records
 */
export function loadExcelApiIndicators(): Indicator[] {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Excel source file not found at ${EXCEL_PATH}`);
  }

  const fileBuffer = fs.readFileSync(EXCEL_PATH);
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet);

  // Read LIVE_SNAP and provinces from template HTML if available
  interface ResourceField {
    value?: string | number;
    unit?: string | null;
  }
  interface ProvinceRecord {
    resources?: Record<string, ResourceField>;
  }

  let provinces: Record<string, ProvinceRecord> = {};
  if (fs.existsSync(HTML_PATH)) {
    try {
      const html = fs.readFileSync(HTML_PATH, "utf-8");
      const snapMatch = html.match(/const LIVE_SNAP\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
      if (snapMatch) {
        const liveSnap = JSON.parse(snapMatch[1]);
        provinces = (liveSnap.province || {}) as Record<string, ProvinceRecord>;
      }
    } catch {
      // Ignore parse errors, fall back to defaults
    }
  }

  // Read prototype request JSON map for pre-configured indicators
  const reqMap = new Map<string, Indicator>();
  if (fs.existsSync(REQ_JSON_PATH)) {
    try {
      const reqJson = JSON.parse(fs.readFileSync(REQ_JSON_PATH, "utf-8"));
      for (const ind of reqJson.indicators || []) {
        if (ind.source_url && !ind.source_url.toLowerCase().includes(".pdf")) {
          reqMap.set(ind.source_url.split("?")[0], ind);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Filter the 112 API rows
  const apiTypes = ["Free API (JSON)", "Free API", "XML", "Free API (CSV)"];
  const apiRows = rows.filter((r) => apiTypes.includes(r["Access Type"]));

  const seenIds = new Set<string>();

  return apiRows.map((r) => {
    const url = (r["URL"] || "").trim();
    const baseUrl = url.split("?")[0];
    const rowNum = r["#"];
    const category = (r["Category"] || "API").trim();
    const desc = (r["Data Points to Capture"] || "").trim();
    const scope = (r["Country / Scope"] || "").trim();
    const accessType = r["Access Type"];

    // 1. Solar Resource — Global Solar Atlas (21 rows)
    if (category.includes("Global Solar Atlas")) {
      const provName = scope.replace("Papua New Guinea —", "").trim();
      const provKeys = Object.keys(provinces);
      const matchKey = provKeys.find(
        (k) =>
          k.toLowerCase().includes(provName.toLowerCase()) ||
          provName.toLowerCase().includes(k.replace("PNG|", "").toLowerCase())
      );
      const provData = matchKey ? provinces[matchKey]?.resources || {} : {};
      const ghiVal =
        provData.ghi?.value !== undefined
          ? parseFloat(String(provData.ghi.value))
          : 1661.55;

      return {
        indicator_id: `gsa_ghi_${rowNum}`,
        category,
        display_name: `Global Solar Atlas GHI — ${provName}`,
        source_url: url,
        json_path:
          "annual.data.GHI || annual.data.PVOUT_csi || annual.data.DNI || annual.data.DIF || annual.data.TEMP || ghi || pvout || dni || dif",
        ui_value: parseFloat(ghiVal.toFixed(2)),
        unit: "kWh/m²",
        tolerance: 5.0,
      };
    }

    // 2. If pre-mapped in request_json_example.json, preserve that configuration
    if (reqMap.has(baseUrl)) {
      const existing = reqMap.get(baseUrl)!;
      let id = existing.indicator_id;
      if (seenIds.has(id)) {
        id = `${id}_${rowNum}`;
      }
      seenIds.add(id);

      return {
        indicator_id: id,
        category,
        display_name: existing.display_name || desc.split("—")[0].trim(),
        source_url: url,
        json_path: existing.json_path,
        ui_value: existing.ui_value,
        unit: existing.unit || "",
        tolerance: existing.tolerance ?? 0.05,
      };
    }

    // 2. Solar Resource — NASA POWER API (21 rows)
    if (category.includes("NASA POWER")) {
      const provName = scope.replace("Papua New Guinea —", "").trim();
      const snapKey = `PNG|${provName}`;
      const provData = provinces[snapKey]?.resources || {};
      const ghiVal = provData.ghi?.value !== undefined
        ? parseFloat(String(provData.ghi.value)) / 365.25
        : 5.43;

      return {
        indicator_id: `nasa_power_${rowNum}`,
        category,
        display_name: `NASA POWER Solar GHI — ${provName}`,
        source_url: url,
        json_path:
          "properties.parameter.ALLSKY_SFC_SW_DWN.202513 || properties.parameter.ALLSKY_SFC_SW_DWN.ANN",
        ui_value: parseFloat(ghiVal.toFixed(2)),
        unit: "kWh/m²/day",
        tolerance: 0.5,
      };
    }

    // 3. Geocoding — OpenStreetMap Nominatim (21 rows)
    if (category.includes("Nominatim")) {
      const provName = scope.replace("Papua New Guinea —", "").trim();
      const snapKey = `PNG|${provName}`;
      const provData = provinces[snapKey]?.resources || {};
      const latVal =
        provData.lat?.value !== undefined
          ? parseFloat(String(provData.lat.value))
          : -9.44;

      return {
        indicator_id: `nominatim_${rowNum}`,
        category,
        display_name: `OSM Geocoding Coordinates — ${provName}`,
        source_url: url,
        json_path: "$[0].lat",
        ui_value: latVal,
        unit: "deg",
        tolerance: 0.2,
      };
    }

    // 4. World Bank WDI API (27 rows total in Excel)
    if (category.includes("World Bank")) {
      const codeMatch = url.match(/\/indicator\/([^?]+)/);
      const code = codeMatch ? codeMatch[1] : `WB_${rowNum}`;
      let uiVal: number | string = 0;
      let tolerance = 0.1;
      let unit = "%";

      if (code.includes("FR.INR.LEND")) {
        uiVal = 8.29;
        unit = "%";
      } else if (code.includes("EG.USE.ELEC")) {
        uiVal = 100;
        unit = "kWh/capita";
      } else if (code.includes("PA.NUS.FCRF")) {
        uiVal = 4.48;
        unit = "PGK/USD";
      } else if (code.includes("SP.POP.TOTL")) {
        uiVal = 10762817;
        unit = "people";
        tolerance = 0;
      } else if (code.includes("AG.LND.FRST")) {
        uiVal = 78.95;
        unit = "%";
      } else if (code.includes("AG.LND.AGRI")) {
        uiVal = 3.10;
        unit = "%";
      } else if (code.includes("LP.LPI.INFR")) {
        uiVal = 2.4;
        unit = "score";
      } else if (code.includes("FP.CPI.TOTL")) {
        uiVal = 4.42;
        unit = "%";
      } else if (code.includes("NY.GDP.MKTP")) {
        uiVal = 32500000000;
        unit = "USD";
        tolerance = 0.05;
      } else if (code.includes("NY.GDP.PCAP")) {
        uiVal = 3020;
        unit = "USD";
        tolerance = 0.05;
      }

      return {
        indicator_id: code,
        category,
        display_name: desc.split("—")[0].trim() || code,
        source_url: url,
        json_path: "$[1][0].value",
        ui_value: uiVal,
        unit,
        tolerance,
      };
    }

    // 5. FX Rates — Currency API (4 rows)
    if (category.includes("FX Rates")) {
      return {
        indicator_id: `fx_rate_${rowNum}`,
        category,
        display_name: desc.split("—")[0].trim() || "USD/PGK Exchange Rate",
        source_url: url,
        json_path: "rates.PGK",
        ui_value: 4.5,
        unit: "PGK",
        tolerance: 0.2,
      };
    }

    // 6. XML / RSS News Feeds (10 rows)
    if (accessType === "XML") {
      return {
        indicator_id: `xml_feed_${rowNum}`,
        category,
        display_name: desc.split("—")[0].trim() || `XML Feed #${rowNum}`,
        source_url: url,
        json_path: null,
        ui_value: "Active",
        unit: "status",
        tolerance: 0,
      };
    }

    // 7. Free API (CSV) (3 rows)
    if (accessType === "Free API (CSV)") {
      let uiVal: number | string = "Available";
      if (category.includes("Treasury")) {
        uiVal = 5.24;
      }
      return {
        indicator_id: `csv_source_${rowNum}`,
        category,
        display_name: desc.split("—")[0].trim() || `CSV Source #${rowNum}`,
        source_url: url,
        json_path: null,
        ui_value: uiVal,
        unit: category.includes("Treasury") ? "%" : "status",
        tolerance: 0.1,
      };
    }

    // Fallback for any other API
    return {
      indicator_id: `api_source_${rowNum}`,
      category,
      display_name: desc.split("—")[0].trim() || `API Source #${rowNum}`,
      source_url: url,
      json_path: "$[0]",
      ui_value: "Active",
      unit: "status",
      tolerance: 0,
    };
  });
}

/**
 * Loads the 18 PDF indicators extracted from RXBE PDF sources:
 * World Bank IDA21, JICA, Business Ready, IPA Energy Guide, Land Act, FAO, IRENA.
 */
export function loadPdfIndicators(): Indicator[] {
  return buildPdfIndicators(HTML_PATH);
}

/**
 * Loads ALL indicators (112 Excel API sources + 18 PDF sources = 130 records).
 * This ensures that when viewing "All Indicators", all 18 PDF records are included,
 * and all 112 Excel API sources are fully represented.
 */
export function loadAllIndicators(): Indicator[] {
  const apis = loadExcelApiIndicators();
  const pdfs = loadPdfIndicators();
  return [...apis, ...pdfs];
}
