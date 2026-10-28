import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import type { Indicator } from "./types";
import { generateScrapeConfig } from "./scrape-config-generator";
import {
  loadLiveSnap,
  getCountryIndicator,
  getProvinceResource,
  type LiveSnapData,
} from "./livesnap-resolver";
import { getCountryConfig, type CountryConfig } from "./country-config";

export interface WizardExcelRow {
  "Screen Section"?: string;
  "Wizard Field"?: string;
  "Source Category"?: string;
  "Source URL"?: string;
  "Source Type"?: string;
  // Legacy / AllSources columns
  "#"?: number;
  Category?: string;
  "Country / Scope"?: string;
  URL?: string;
  "Data Points to Capture"?: string;
  "Access Type"?: string;
  "Integration Notes"?: string;
  Working?: string;
  [key: string]: unknown;
}

export interface ParseOptions {
  excelPath?: string;
  htmlPath?: string;
  countryCode?: string;
  province?: string;
  includeInternal?: boolean;
}

/**
 * Standardize World Bank indicator code from URL
 */
function extractWdiIndicatorCode(url: string): string | null {
  const match = url.match(/\/indicator\/([A-Za-z0-9_.]+)/i);
  return match ? match[1] : null;
}

/**
 * Normalizes URL for specific country and coordinates
 */
function templateSourceUrl(
  rawUrl: string,
  countryCfg: CountryConfig,
  lat: number,
  lon: number,
  province: string
): string {
  let url = rawUrl.trim();
  if (url === "-" || !url) return url;

  // 1. World Bank country code replacement
  url = url.replace(
    /api\.worldbank\.org\/v2\/country\/[A-Z]{2}\/indicator/i,
    `api.worldbank.org/v2/country/${countryCfg.wb_country_code}/indicator`
  );

  // 2. OpenStreetMap Nominatim query replacement
  if (url.includes("nominatim.openstreetmap.org")) {
    const query = encodeURIComponent(`${province},${countryCfg.country}`);
    url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
  }

  // 3. Global Solar Atlas location coordinates replacement
  if (url.includes("globalsolaratlas.info")) {
    url = `https://api.globalsolaratlas.info/data/lta?loc=${lat.toFixed(4)},${lon.toFixed(4)}`;
  }

  // 4. TradingEconomics slug replacement
  if (url.includes("tradingeconomics.com/papua-new-guinea/")) {
    url = url.replace("tradingeconomics.com/papua-new-guinea/", `tradingeconomics.com/${countryCfg.slug}/`);
  }

  // 5. Green Climate Fund slug replacement
  if (url.includes("greenclimate.fund/countries/papua-new-guinea")) {
    url = url.replace("greenclimate.fund/countries/papua-new-guinea", `greenclimate.fund/countries/${countryCfg.slug}`);
  }

  return url;
}

/**
 * Parses Wizard Step 1 Excel sheet into standardized Indicators
 */
export function parseWizardStep1Rows(
  rows: WizardExcelRow[],
  liveSnap: LiveSnapData,
  countryCfg: CountryConfig,
  province: string,
  includeInternal = false
): Indicator[] {
  const indicators: Indicator[] = [];
  const iso3 = countryCfg.iso3;

  // Coordinates from LIVE_SNAP or fallback to config
  const snapLat = getProvinceResource(liveSnap, iso3, province, "lat");
  const snapLon = getProvinceResource(liveSnap, iso3, province, "lon");
  const lat = typeof snapLat === "number" ? snapLat : countryCfg.coordinates.latitude;
  const lon = typeof snapLon === "number" ? snapLon : countryCfg.coordinates.longitude;

  rows.forEach((row, index) => {
    const screenSection = (row["Screen Section"] || "").trim();
    const wizardField = (row["Wizard Field"] || "").trim();
    const sourceCategory = (row["Source Category"] || "").trim();
    const rawUrl = (row["Source URL"] || "").trim();
    const sourceType = (row["Source Type"] || "").trim();

    const isInternal = sourceType === "Not from a source" || rawUrl === "-";

    if (isInternal && !includeInternal) {
      return;
    }

    const templatedUrl = isInternal
      ? "internal://user_input"
      : templateSourceUrl(rawUrl, countryCfg, lat, lon, province);

    // Indicator configuration resolver
    let indicatorId = "";
    let category = sourceCategory !== "-" ? sourceCategory : screenSection;
    let displayName = wizardField;
    let jsonPath: string | null = null;
    let uiValue: number | string = 0;
    let unit = "";
    let tolerance = 0;
    let scrapeConfig = null;

    // ── Location Section ─────────────────────────────────────────────────────
    if (screenSection === "Location") {
      if (wizardField === "Country / Province lists") {
        indicatorId = "country_province_lists";
        uiValue = `${countryCfg.country} / ${province}`;
        unit = "text";
      } else if (wizardField === "District / Village / City") {
        indicatorId = "district_village_city";
        uiValue = province;
        unit = "text";
      } else if (wizardField === "Latitude") {
        indicatorId = "site_latitude";
        displayName = "Site Latitude";
        jsonPath = "[0].lat";
        uiValue = snapLat !== null ? Number(Number(snapLat).toFixed(6)) : lat;
        unit = "deg";
        tolerance = 0.05;
      } else if (wizardField === "Longitude") {
        indicatorId = "site_longitude";
        displayName = "Site Longitude";
        jsonPath = "[0].lon";
        uiValue = snapLon !== null ? Number(Number(snapLon).toFixed(6)) : lon;
        unit = "deg";
        tolerance = 0.05;
      } else if (wizardField.includes("Site address")) {
        indicatorId = "site_address";
        displayName = "Site Address Line";
        jsonPath = "[0].display_name";
        const snapAddr = getProvinceResource(liveSnap, iso3, province, "display_name");
        uiValue = (snapAddr as string) || `${province}, ${countryCfg.country}`;
        unit = "text";
        tolerance = 0;
      } else if (wizardField.includes("Badge: 'GHI")) {
        indicatorId = "solar_daily_ghi";
        displayName = "Daily GHI (National Capital District)";
        jsonPath = "daily_ghi || ghi || annual.data.GHI || pvout";
        uiValue = 5.43; // Standard daily GHI baseline from LIVE_SNAP / request prototype
        unit = "kWh/m²";
        tolerance = 5.0;
      } else if (wizardField.includes("43% electrified")) {
        indicatorId = "electricity_access_badge";
        displayName = "Electrification Access Badge (% population)";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["access_to_electricity_of_population"]);
        uiValue = val !== null ? Number(val) : 43.3;
        unit = "%";
        tolerance = 0.1;
      } else if (wizardField.includes("GCF: Yes")) {
        indicatorId = "gcf_eligibility_badge";
        displayName = "Green Climate Fund (GCF) Eligibility Badge";
        scrapeConfig = generateScrapeConfig({
          field: wizardField,
          category: sourceCategory,
          url: rawUrl,
          countryName: countryCfg.country,
        });
        uiValue = "Yes";
        unit = "status";
        tolerance = 0;
      }
    }

    // ── Grid & connection Section ────────────────────────────────────────────
    else if (screenSection === "Grid & connection") {
      indicatorId = "grid_connection_metadata";
      displayName = "Grid Connection Recommendation";
      uiValue = `${countryCfg.grid_connection_type} (${countryCfg.distance_to_grid_km} km)`;
      unit = "text";
    }

    // ── Editable assumptions Section ─────────────────────────────────────────
    else if (screenSection === "Editable assumptions") {
      if (wizardField === "REPO Rate") {
        indicatorId = "central_bank_repo_rate";
        category = "Country Indicators — Central Bank";
        displayName = "Kina Facility Rate (REPO equivalent)";
        scrapeConfig = generateScrapeConfig({
          field: wizardField,
          category: sourceCategory,
          url: rawUrl,
          countryName: countryCfg.country,
        });
        const val = getCountryIndicator(liveSnap, iso3, ["repo", "kina facility rate"]);
        uiValue = val !== null ? Number(val) : 5.0;
        unit = "%";
        tolerance = 0;
      } else if (wizardField === "Grid Tariff") {
        indicatorId = "grid_electricity_tariff";
        category = "Utility Tariff & Data";
        displayName = "Grid Electricity Tariff (General Supply)";
        scrapeConfig = generateScrapeConfig({
          field: wizardField,
          category: sourceCategory,
          url: rawUrl,
          countryName: countryCfg.country,
        });
        uiValue = 0.28;
        unit = "USD/kWh";
        tolerance = 0.04;
      } else if (wizardField.includes("Diesel Cost")) {
        indicatorId = "diesel_displacement_cost";
        category = "Fuel Price — ICCC";
        displayName = "Diesel Generation Cost displaced";
        scrapeConfig = generateScrapeConfig({
          field: wizardField,
          category: sourceCategory,
          url: rawUrl,
          countryName: countryCfg.country,
        });
        uiValue = 0.65;
        unit = "USD/kWh";
        tolerance = 0.23;
      } else if (wizardField === "Corporate Tax") {
        indicatorId = "corporate_tax_rate";
        category = "Tax";
        displayName = "Corporate Income Tax (CIT) Rate";
        scrapeConfig = generateScrapeConfig({
          field: wizardField,
          category: sourceCategory,
          url: rawUrl,
          countryName: countryCfg.country,
        });
        const val = getCountryIndicator(liveSnap, iso3, ["tax", "tax rate"]);
        uiValue = val !== null ? Number(val) : 30;
        unit = "%";
        tolerance = 0;
      }
    }

    // ── Country indicators Section ───────────────────────────────────────────
    else if (screenSection === "Country indicators") {
      if (wizardField.includes("Commercial Lending")) {
        indicatorId = "commercial_lending_rate";
        category = "Macroeconomic — World Bank WDI";
        displayName = "Commercial Lending Rate (%)";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["lending_interest_rate"]);
        uiValue = val !== null ? Number(val) : 8.29;
        unit = "%";
        tolerance = 0.05;
      } else if (wizardField === "Electrification") {
        indicatorId = "electricity_access_rate";
        category = "Macroeconomic — World Bank WDI";
        displayName = "Electrification access rate (% of population)";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["access_to_electricity_of_population"]);
        uiValue = val !== null ? Number(val) : 43.3;
        unit = "%";
        tolerance = 0.1;
      } else if (wizardField === "Population") {
        const isMrv1 = rawUrl.includes("mrv=1");
        indicatorId = isMrv1 ? "population_total" : `population_country_indicators_${index + 1}`;
        category = "Macroeconomic — World Bank WDI";
        displayName = isMrv1 ? "Population Total" : "Population Total (MRV 5)";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["population_total"]);
        uiValue = val !== null ? Number(val) : 10762817;
        unit = "count";
        tolerance = 0;
      } else if (wizardField.includes("FX Rate")) {
        if (sourceType.includes("scrape")) {
          indicatorId = "fx_rate_tradingeconomics";
          category = "Country Indicators — Central Bank";
          displayName = "FX Rate (TradingEconomics)";
          scrapeConfig = generateScrapeConfig({
            field: wizardField,
            category: sourceCategory,
            url: rawUrl,
            countryName: countryCfg.country,
          });
          const val = getCountryIndicator(liveSnap, iso3, ["pgk", "usd"]);
          uiValue = val !== null ? Number(val) : 4.5298;
          unit = countryCfg.currency_code;
          tolerance = 0.06;
        } else if (rawUrl.includes("currencies.json")) {
          indicatorId = "fx_currency_catalog";
          category = "Country Indicators — FX Rates API";
          displayName = "FX Currency Catalog Verification";
          jsonPath = countryCfg.currency_code.toLowerCase();
          uiValue = "Papua New Guinean Kina";
          unit = "name";
          tolerance = 0;
        } else {
          indicatorId = "fx_rate_usd_pgk";
          category = "Country Indicators — FX Rates API";
          displayName = `FX Rate (USD / ${countryCfg.currency_code})`;
          jsonPath = `usd.${countryCfg.currency_code.toLowerCase()} || rates.${countryCfg.currency_code}`;
          const val = getCountryIndicator(liveSnap, iso3, [countryCfg.currency_code, "PGK"]);
          uiValue = val !== null ? Number(val) : 4.5346;
          unit = countryCfg.currency_code;
          tolerance = 0.06;
        }
      } else if (wizardField === "GCF Access") {
        indicatorId = "gcf_eligibility";
        category = "Climate Finance — Green Climate Fund";
        displayName = "Green Climate Fund (GCF) Access";
        scrapeConfig = generateScrapeConfig({
          field: wizardField,
          category: sourceCategory,
          url: rawUrl,
          countryName: countryCfg.country,
        });
        uiValue = "Yes";
        unit = "status";
        tolerance = 0;
      } else if (wizardField.includes("Utility")) {
        indicatorId = "utility_provider";
        uiValue = "PNG Power Ltd";
        unit = "name";
      }
    }

    // ── Economy - macro Section ──────────────────────────────────────────────
    else if (screenSection === "Economy - macro") {
      const wdiCode = extractWdiIndicatorCode(rawUrl);
      category = "Macroeconomic — World Bank WDI";

      if (wizardField === "GDP" || wdiCode === "NY.GDP.MKTP.CD") {
        indicatorId = "gdp_current_usd";
        displayName = "GDP current USD";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["gdp_current_us"]);
        uiValue = val !== null ? Math.round(Number(val)) : 32500000000;
        unit = "USD";
        tolerance = 0.05;
      } else if (wizardField === "GDP per capita" || wdiCode === "NY.GDP.PCAP.CD") {
        indicatorId = "gdp_per_capita_usd";
        displayName = "GDP per capita current USD";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["gdp_per_capita_current_us"]);
        uiValue = val !== null ? Math.round(Number(val)) : 3020;
        unit = "USD";
        tolerance = 0.05;
      } else if (wizardField === "Population" || wdiCode === "SP.POP.TOTL") {
        indicatorId = `population_macro_${index + 1}`;
        displayName = "Population Total";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["population_total"]);
        uiValue = val !== null ? Number(val) : 10762817;
        unit = "count";
        tolerance = 0;
      } else if (wizardField.includes("Inflation") || wdiCode === "FP.CPI.TOTL.ZG") {
        indicatorId = "inflation_cpi";
        displayName = "Inflation (CPI annual %)";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["inflation_consumer_prices_annual"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(1)) : 4.4;
        unit = "%";
        tolerance = 0.1;
      } else if (wizardField.includes("FDI") || wdiCode === "BX.KLT.DINV.CD.WD") {
        indicatorId = "fdi_net_inflows_usd";
        displayName = "FDI net inflows (BoP current USD)";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["foreign_direct_investment_net_inflows_bop_current_us"]);
        uiValue = val !== null ? Math.round(Number(val)) : -198300000;
        unit = "USD";
        tolerance = 0.05;
      } else if (wizardField.includes("Remittances") || wdiCode === "BX.TRF.PWKR.CD.DT") {
        indicatorId = "remittances_received_usd";
        displayName = "Personal remittances received (current USD)";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["personal_remittances_received_current_us"]);
        uiValue = val !== null ? Math.round(Number(val)) : 3900000;
        unit = "USD";
        tolerance = 0.05;
      } else if (wizardField.includes("Non-hydro") || wdiCode === "EG.ELC.RNWX.ZS") {
        indicatorId = "renewable_non_hydro_pct";
        displayName = "Renewable electricity output excluding hydro (% of total)";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["electricity_production_from_renewable_sources_excluding_hydroelectric_of_total"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(1)) : 4.7;
        unit = "%";
        tolerance = 0.1;
      } else if (wizardField.includes("RE share") || wdiCode === "EG.ELC.RNEW.ZS") {
        indicatorId = "renewable_electricity_output_pct";
        displayName = "Renewable electricity output (% of total electricity)";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["renewable_electricity_output_of_total_electricity_output"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(1)) : 40.0;
        unit = "%";
        tolerance = 0.1;
      } else if (wizardField.includes("CO2") || wdiCode === "EN.GHG.CO2.PC.CE.AR5") {
        indicatorId = "co2_emissions_per_capita";
        displayName = "CO2 emissions per capita (metric tons)";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["carbon_dioxide_co2_emissions_excluding_lulucf_per_capita_t_co2e_capita"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : 0.52;
        unit = "metric tons";
        tolerance = 0.05;
      } else if (wizardField.includes("Land area") || wdiCode === "AG.LND.TOTL.K2") {
        indicatorId = "land_area_sq_km";
        displayName = "Land area (sq km)";
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["land_area_sq_km"]);
        uiValue = val !== null ? Number(val) : 452860;
        unit = "sq km";
        tolerance = 0.05;
      }
    }

    // ── Economy - governance Section ─────────────────────────────────────────
    else if (screenSection === "Economy - governance") {
      const wdiCode = extractWdiIndicatorCode(rawUrl);
      category = "Macroeconomic — World Bank WDI";
      jsonPath = "[1][0].value";
      unit = "score";
      tolerance = 0.25;

      if (wizardField.includes("Regulatory Quality") || wdiCode === "GOV_WGI_RQ_EST") {
        indicatorId = "wgi_regulatory_quality";
        displayName = "Regulatory Quality estimate";
        const val = getCountryIndicator(liveSnap, iso3, ["regulatory_quality_governance_estimate_approx_2_5_to_2_5"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : -0.6;
      } else if (wizardField.includes("Rule of Law") || wdiCode === "GOV_WGI_RL_EST") {
        indicatorId = "wgi_rule_of_law";
        displayName = "Rule of Law estimate";
        const val = getCountryIndicator(liveSnap, iso3, ["rule_of_law_governance_estimate_approx_2_5_to_2_5"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : -0.57;
      } else if (wizardField.includes("Political Stability") || wdiCode === "GOV_WGI_PV_EST") {
        indicatorId = "wgi_political_stability";
        displayName = "Political Stability & Absence of Violence";
        const val = getCountryIndicator(liveSnap, iso3, ["political_stability_governance_estimate_approx_2_5_to_2_5"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : -0.65;
      } else if (wizardField.includes("Government Effectiveness") || wdiCode === "GOV_WGI_GE_EST") {
        indicatorId = "wgi_government_effectiveness";
        displayName = "Government Effectiveness estimate";
        const val = getCountryIndicator(liveSnap, iso3, ["government_effectiveness_governance_estimate_approx_2_5_to_2_5"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : -0.9;
      } else if (wizardField.includes("Control of Corruption") || wdiCode === "GOV_WGI_CC_EST") {
        indicatorId = "wgi_control_of_corruption";
        displayName = "Control of Corruption estimate";
        const val = getCountryIndicator(liveSnap, iso3, ["control_of_corruption_governance_estimate_approx_2_5_to_2_5"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : -0.78;
      } else if (wizardField.includes("Voice & Accountability") || wdiCode === "GOV_WGI_VA_EST") {
        indicatorId = "wgi_voice_accountability";
        displayName = "Voice & Accountability estimate";
        const val = getCountryIndicator(liveSnap, iso3, ["voice_and_accountability_governance_estimate_approx_2_5_to_2_5"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : -0.33;
      }
    }

    if (!indicatorId) {
      indicatorId = `ind_${index + 1}_${wizardField.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    }

    indicators.push({
      indicator_id: indicatorId,
      category,
      display_name: displayName,
      source_url: templatedUrl,
      json_path: jsonPath,
      ui_value: uiValue,
      unit,
      tolerance,
      ...(scrapeConfig ? { scrape_config: scrapeConfig } : {}),
    });
  });

  return indicators;
}

/**
 * Main parser entry point: reads the Excel sheet and converts it to Indicator objects.
 */
export function parseExcelSources(options?: ParseOptions): Indicator[] {
  const excelPath =
    options?.excelPath ||
    path.resolve(process.cwd(), "helper/RXBE_Wizard_Step1_Sources_Keys.xlsx");
  const htmlPath = options?.htmlPath || path.resolve(process.cwd(), "helper/RXBE_live_Template.html");
  const countryCode = options?.countryCode || "PG";
  const countryCfg = getCountryConfig(countryCode);
  const province = options?.province || countryCfg.default_province;
  const includeInternal = options?.includeInternal ?? false;

  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel source file not found at: ${excelPath}`);
  }

  const fileBuffer = fs.readFileSync(excelPath);
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<WizardExcelRow>(sheet);

  const liveSnap = loadLiveSnap(htmlPath);

  // Check if this is the Wizard Step 1 sheet format
  const isWizardSheet = rows.length > 0 && "Wizard Field" in rows[0];

  if (isWizardSheet) {
    return parseWizardStep1Rows(rows, liveSnap, countryCfg, province, includeInternal);
  }

  // If old/legacy format (with 204 rows and "Data Points to Capture")
  const legacyRows = rows.map((r, i) => ({
    "Screen Section": (r["AI Layer"] as string) || "General",
    "Wizard Field": ((r["Data Points to Capture"] as string) || "").split("—")[0].trim() || `Row ${i + 1}`,
    "Source Category": (r["Category"] as string) || "API",
    "Source URL": (r["URL"] as string) || "-",
    "Source Type": (r["Access Type"] as string) || "API",
  }));

  return parseWizardStep1Rows(legacyRows, liveSnap, countryCfg, province, includeInternal);
}
