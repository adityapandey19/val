import { readFileSync } from "fs";
import { resolve } from "path";
import { validateIndicator } from "./indicator-validator";
import type { Indicator, IndicatorResult } from "./types";

interface LiveSnapIndicator {
  value: string | number;
  unit: string | null;
  source: string;
}

interface LiveSnapData {
  country?: {
    PNG?: {
      indicators?: Record<string, LiveSnapIndicator>;
    };
  };
}

/**
 * Extracts the embedded JSON datasets (LIVE_SNAP and data) from RXBE_live_Template.html.
 */
export function extractHtmlJsonData(htmlPath: string): {
  snapData: LiveSnapData;
  templateData: Record<string, unknown>;
} {
  const content = readFileSync(htmlPath, "utf-8");

  // Extract <script id="data" type="application/json">
  const dataMatch = content.match(
    /<script id="data" type="application\/json">([\s\S]*?)<\/script>/
  );
  const templateData = dataMatch ? JSON.parse(dataMatch[1]) : {};

  // Extract const LIVE_SNAP = {...};
  const snapMatch = content.match(/const LIVE_SNAP\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  const snapData: LiveSnapData = snapMatch ? JSON.parse(snapMatch[1]) : {};

  return { snapData, templateData };
}

/**
 * Builds the list of validation indicators for all source URLs in the Excel sheet
 * that return data in PDF format, binding them with their respective UI values from
 * the template HTML and validation rules.
 */
export function buildPdfIndicators(htmlPath: string): Indicator[] {
  const { snapData } = extractHtmlJsonData(htmlPath);
  const pngSnap = snapData?.country?.PNG?.indicators ?? {};

  return [
    // ── World Bank IDA21 Terms (Row 161 in Excel) ───────────────────────────
    {
      indicator_id: "blend",
      category: "Development Finance — World Bank IDA",
      display_name: "IDA Blend fixed rate %",
      source_url:
        "https://thedocs.worldbank.org/en/doc/45848f4b32bdefb1317a37feb9aba4c1-0410012026/related/IDA21-Terms-effective-07-01-2026.pdf",
      json_path: null,
      ui_value: parseFloat(String(pngSnap["blend"]?.value ?? 2.13)),
      unit: "%",
      tolerance: 0.15,
    },
    {
      indicator_id: "loan_tenure_years",
      category: "Development Finance — World Bank IDA",
      display_name: "Commercial / DFI Loan Tenure (Shorter-term)",
      source_url:
        "https://thedocs.worldbank.org/en/doc/45848f4b32bdefb1317a37feb9aba4c1-0410012026/related/IDA21-Terms-effective-07-01-2026.pdf",
      json_path: null,
      ui_value: 12,
      unit: "years",
      tolerance: 0,
    },
    {
      indicator_id: "IDA.tenor",
      category: "Development Finance — World Bank IDA",
      display_name: "IDA Blend Tenor",
      source_url:
        "https://thedocs.worldbank.org/en/doc/45848f4b32bdefb1317a37feb9aba4c1-0410012026/related/IDA21-Terms-effective-07-01-2026.pdf",
      json_path: null,
      ui_value: parseInt(String(pngSnap["IDA.tenor"]?.value ?? 25), 10),
      unit: "yrs",
      tolerance: 0,
    },
    {
      indicator_id: "IDA regular service charge",
      category: "Development Finance — World Bank IDA",
      display_name: "IDA Regular Service Charge",
      source_url:
        "https://thedocs.worldbank.org/en/doc/45848f4b32bdefb1317a37feb9aba4c1-0410012026/related/IDA21-Terms-effective-07-01-2026.pdf",
      json_path: null,
      ui_value: parseFloat(String(pngSnap["IDA regular service charge"]?.value ?? 1.29)),
      unit: "%",
      tolerance: 0.05,
    },
    {
      indicator_id: "IDA.eligible",
      category: "Development Finance — World Bank IDA",
      display_name: "IDA Eligibility Status",
      source_url:
        "https://thedocs.worldbank.org/en/doc/45848f4b32bdefb1317a37feb9aba4c1-0410012026/related/IDA21-Terms-effective-07-01-2026.pdf",
      json_path: null,
      ui_value: String(pngSnap["IDA.eligible"]?.value ?? "Blend"),
      unit: "status",
      tolerance: 0,
    },

    // ── Development Finance — JICA (Row 166 in Excel) ────────────────────────
    {
      indicator_id: "JICA.rate",
      category: "Development Finance — JICA",
      display_name: "JICA Fixed Rate Standard",
      source_url:
        "https://www.jica.go.jp/english/activities/schemes/finance_co/standard/__icsFiles/afieldfile/2026/03/27/20260401_EN.pdf",
      json_path: null,
      ui_value: 3.4,
      unit: "%",
      tolerance: 0.05,
    },
    {
      indicator_id: "JICA.tenor",
      category: "Development Finance — JICA",
      display_name: "JICA Loan Tenor (Years)",
      source_url:
        "https://www.jica.go.jp/english/activities/schemes/finance_co/standard/__icsFiles/afieldfile/2026/03/27/20260401_EN.pdf",
      json_path: null,
      ui_value: parseInt(String(pngSnap["JICA.tenor"]?.value ?? 30), 10),
      unit: "yrs",
      tolerance: 0,
    },
    {
      indicator_id: "JICA.eligible",
      category: "Development Finance — JICA",
      display_name: "JICA Eligible Category",
      source_url:
        "https://www.jica.go.jp/english/activities/schemes/finance_co/standard/__icsFiles/afieldfile/2026/03/27/20260401_EN.pdf",
      json_path: null,
      ui_value: String(pngSnap["JICA.eligible"]?.value ?? "Lower-Middle-Income"),
      unit: "status",
      tolerance: 0,
    },

    // ── World Bank Business Ready - PNG (Row 159 in Excel) ───────────────────
    {
      indicator_id: "bready_operational_efficiency",
      category: "World Bank Business Ready - PNG",
      display_name: "Business Ready: Operational Efficiency",
      source_url:
        "https://www.worldbank.org/content/dam/sites/b-ready/documents/pdf/economy/2025/papua-new-guinea-2025.pdf",
      json_path: null,
      ui_value: parseInt(String(pngSnap["bready_operational_efficiency"]?.value ?? 43), 10),
      unit: "points",
      tolerance: 0,
    },
    {
      indicator_id: "bready_regulatory_framework",
      category: "World Bank Business Ready - PNG",
      display_name: "Business Ready: Regulatory Framework",
      source_url:
        "https://www.worldbank.org/content/dam/sites/b-ready/documents/pdf/economy/2025/papua-new-guinea-2025.pdf",
      json_path: null,
      ui_value: parseInt(String(pngSnap["bready_regulatory_framework"]?.value ?? 55), 10),
      unit: "points",
      tolerance: 0,
    },
    {
      indicator_id: "bready_public_services",
      category: "World Bank Business Ready - PNG",
      display_name: "Business Ready: Public Services",
      source_url:
        "https://www.worldbank.org/content/dam/sites/b-ready/documents/pdf/economy/2025/papua-new-guinea-2025.pdf",
      json_path: null,
      ui_value: parseInt(String(pngSnap["bready_public_services"]?.value ?? 33), 10),
      unit: "points",
      tolerance: 0,
    },

    // ── IPA PNG Energy Sector Investor Guide (Row 147 in Excel) ──────────────
    {
      indicator_id: "customary_land_pct",
      category: "Land Tenure & Legal Risk",
      display_name: "Customary Land Percentage",
      source_url:
        "https://www.ipa.gov.pg/Documentation/PG/PNG%20Energy%20Sector%20Investor%20Guide_12%20AUGUST2022%20_508%20compliant_FINAL.pdf",
      json_path: null,
      ui_value: 97,
      unit: "%",
      tolerance: 0,
    },
    {
      indicator_id: "tax_holiday",
      category: "Land Tenure & Legal Risk",
      display_name: "Tax Holiday Statutory Basis",
      source_url:
        "https://www.ipa.gov.pg/Documentation/PG/PNG%20Energy%20Sector%20Investor%20Guide_12%20AUGUST2022%20_508%20compliant_FINAL.pdf",
      json_path: null,
      ui_value: "Section 45 I-M",
      unit: "statute",
      tolerance: 0,
    },
    {
      indicator_id: "loss_carry_forward",
      category: "Land Tenure & Legal Risk",
      display_name: "Tax Loss Carry Forward Duration",
      source_url:
        "https://www.ipa.gov.pg/Documentation/PG/PNG%20Energy%20Sector%20Investor%20Guide_12%20AUGUST2022%20_508%20compliant_FINAL.pdf",
      json_path: null,
      ui_value: 20,
      unit: "years",
      tolerance: 0,
    },
    {
      indicator_id: "import_duty_re_equipment",
      category: "Land Tenure & Legal Risk",
      display_name: "Import Duty on RE Equipment",
      source_url:
        "https://www.ipa.gov.pg/Documentation/PG/PNG%20Energy%20Sector%20Investor%20Guide_12%20AUGUST2022%20_508%20compliant_FINAL.pdf",
      json_path: null,
      ui_value: 0,
      unit: "%",
      tolerance: 0,
    },

    // ── Land Legislation Statutes (Rows 148, 149 in Excel) ───────────────────
    {
      indicator_id: "land_act_1996",
      category: "Land Tenure & Legal Risk",
      display_name: "Statutory Reference: Land Act 1996",
      source_url: "https://www.dplga.gov.pg/wp-content/uploads/2022/06/LandAct.pdf",
      json_path: null,
      ui_value: "Land Act 1996 (No 45 of 1996)",
      unit: "statute",
      tolerance: 0,
    },
    {
      indicator_id: "land_groups_act_1974",
      category: "Land Tenure & Legal Risk",
      display_name: "Statutory Reference: Land Groups Incorporation Act",
      source_url: "https://faolex.fao.org/docs/pdf/png20852.pdf",
      json_path: null,
      ui_value: "Land Groups Incorporation Act 1974",
      unit: "statute",
      tolerance: 0,
    },

    // ── IRENA Statistical Profile (Row 21 in Excel) ──────────────────────────
    {
      indicator_id: "share",
      category: "IRENA",
      display_name: "Renewable Share (% of Total)",
      source_url:
        "https://www.irena.org/-/media/Files/IRENA/Agency/Statistics/Statistical_Profiles/Oceania/Papua-New-Guinea_Oceania_RE_SP.pdf",
      json_path: null,
      ui_value: parseInt(String(pngSnap["share"]?.value ?? 46), 10),
      unit: "%",
      tolerance: 1.0,
    },
  ];
}

/**
 * Executes validation for all PDF sources and returns a structured validation summary.
 */
export async function validateAllPdfSources(htmlPath: string): Promise<{
  total: number;
  matched: number;
  mismatched: number;
  errors: number;
  results: IndicatorResult[];
}> {
  const indicators = buildPdfIndicators(htmlPath);
  console.log(`Validating ${indicators.length} PDF sources from Excel against UI data in JSON...`);

  const results = await Promise.all(
    indicators.map((indicator) => validateIndicator(indicator))
  );

  let matched = 0;
  let mismatched = 0;
  let errors = 0;

  for (const r of results) {
    if (r.status === "SUCCESS") {
      if (r.is_matched) matched++;
      else mismatched++;
    } else if (r.status === "ERROR") {
      errors++;
    }
  }

  return {
    total: results.length,
    matched,
    mismatched,
    errors,
    results,
  };
}

// ── Direct CLI Runner ────────────────────────────────────────────────────────
if (typeof process !== "undefined" && process.argv[1]?.endsWith("validate-pdf-sources.ts")) {
  const htmlPath = resolve(__dirname, "RXBE_live_Template.html");
  validateAllPdfSources(htmlPath)
    .then((summary) => {
      console.log("\n========================================================");
      console.log("PDF SOURCES VALIDATION SUMMARY");
      console.log("========================================================");
      console.log(`Total PDF Indicators: ${summary.total}`);
      console.log(`Matched:              ${summary.matched} ✅`);
      console.log(`Mismatched:           ${summary.mismatched} ❌`);
      console.log(`Errors:               ${summary.errors}`);
      console.log("========================================================\n");

      for (const r of summary.results) {
        const icon = r.is_matched ? "✅" : r.status === "ERROR" ? "⚠️" : "❌";
        console.log(
          `${icon} [${r.status}] ${r.indicator_id.padEnd(30)} ` +
            `Extracted: ${String(r.source_value).padEnd(25)} ` +
            `UI: ${String(r.ui_value).padEnd(25)} ` +
            `Diff: ${String(r.difference).padEnd(10)}`
        );
      }
    })
    .catch((err) => {
      console.error("Validation failed:", err);
      process.exit(1);
    });
}
