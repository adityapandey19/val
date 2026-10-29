import { parseHtmlTableRows } from "./htmlHelper";
import type { IndicatorSourceMetadata } from "../types";

export interface DamodaranScrapeResult {
  readonly success: boolean;
  readonly value: number | null;
  readonly unit: string;
  readonly metadata: IndicatorSourceMetadata;
  readonly error?: string;
}

/**
 * Scrapes Damodaran (NYU Stern) Country Risk Premium table
 * Returns Cost of Equity (Ke) = Risk Free Rate (approx 4.65%) + Equity Risk Premium (11.35%) = 16.0%
 */
export function scrapeDamodaranCostOfEquity(html: string): DamodaranScrapeResult {
  const rows = parseHtmlTableRows(html);

  for (const row of rows) {
    const country = row.cells[0]?.toLowerCase().trim() || "";
    if (country.includes("papua") && country.includes("guinea")) {
      const rating = row.cells[1] || "";
      const defaultSpread = parseFloat(row.cells[2]?.replace("%", "") || "0");
      const countryRiskPremium = parseFloat(row.cells[3]?.replace("%", "") || "0");
      const equityRiskPremium = parseFloat(row.cells[4]?.replace("%", "") || "0");
      const taxRate = parseFloat(row.cells[5]?.replace("%", "") || "0");

      // Wizard standard Ke calculation baseline:
      // Ke = US 10-Year Treasury Yield (Rf ~ 4.65%) + Total Equity Risk Premium (11.35%) = 16.0%
      const riskFreeRate = 4.65;
      const calculatedKe = parseFloat((riskFreeRate + equityRiskPremium).toFixed(1));

      return {
        success: true,
        value: calculatedKe,
        unit: "%",
        metadata: {
          sourceType: "HTML_SCRAPE",
          provider: "NYU Stern (Aswath Damodaran)",
          periodOrDate: "Current update",
          rawExtracted: {
            country: "Papua New Guinea",
            sovereignRating: rating,
            defaultSpreadPct: defaultSpread,
            countryRiskPremiumPct: countryRiskPremium,
            equityRiskPremiumPct: equityRiskPremium,
            corporateTaxRatePct: taxRate,
            riskFreeRateBaseline: riskFreeRate,
            calculatedKe,
          },
        },
      };
    }
  }

  return {
    success: false,
    value: null,
    unit: "%",
    metadata: {
      sourceType: "HTML_SCRAPE",
      provider: "NYU Stern (Aswath Damodaran)",
    },
    error: "Papua New Guinea not found in Damodaran country risk table.",
  };
}
