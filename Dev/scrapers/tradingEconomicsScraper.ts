import { parseHtmlTableRows } from "./htmlHelper";
import type { IndicatorSourceMetadata } from "../types";

export interface TradingEconomicsScrapeResult {
  readonly success: boolean;
  readonly value: number | null;
  readonly unit: string;
  readonly period?: string;
  readonly metadata: IndicatorSourceMetadata;
  readonly error?: string;
}

/**
 * Scrapes Central Bank Repo / Interest Rate from TradingEconomics HTML
 */
export function scrapeTradingEconomicsInterestRate(html: string): TradingEconomicsScrapeResult {
  const rows = parseHtmlTableRows(html);

  for (const row of rows) {
    const firstCell = row.cells[0]?.toLowerCase().trim();
    if (firstCell === "interest rate") {
      const rateVal = parseFloat(row.cells[1]);
      if (!isNaN(rateVal)) {
        return {
          success: true,
          value: rateVal,
          unit: "%",
          period: row.cells[4] || "latest",
          metadata: {
            sourceType: "HTML_SCRAPE",
            provider: "TradingEconomics",
            periodOrDate: row.cells[4] || "latest",
            rawExtracted: {
              metric: "Interest Rate",
              current: row.cells[1],
              previous: row.cells[2],
              unit: row.cells[3],
              reference: row.cells[4],
            },
          },
        };
      }
    }
  }

  return {
    success: false,
    value: null,
    unit: "%",
    metadata: {
      sourceType: "HTML_SCRAPE",
      provider: "TradingEconomics",
    },
    error: "Row 'Interest Rate' not found in TradingEconomics datatable.",
  };
}

/**
 * Scrapes Corporate Tax Rate from TradingEconomics HTML
 */
export function scrapeTradingEconomicsCorporateTax(html: string): TradingEconomicsScrapeResult {
  const rows = parseHtmlTableRows(html);

  for (const row of rows) {
    const firstCell = row.cells[0]?.toLowerCase().trim();
    if (firstCell === "corporate tax rate") {
      const taxVal = parseFloat(row.cells[1]);
      if (!isNaN(taxVal)) {
        return {
          success: true,
          value: taxVal,
          unit: "%",
          period: row.cells[4] || "latest",
          metadata: {
            sourceType: "HTML_SCRAPE",
            provider: "TradingEconomics",
            periodOrDate: row.cells[4] || "latest",
            rawExtracted: {
              metric: "Corporate Tax Rate",
              current: row.cells[1],
              previous: row.cells[2],
              unit: row.cells[3],
              reference: row.cells[4],
            },
          },
        };
      }
    }
  }

  return {
    success: false,
    value: null,
    unit: "%",
    metadata: {
      sourceType: "HTML_SCRAPE",
      provider: "TradingEconomics",
    },
    error: "Row 'Corporate Tax Rate' not found in TradingEconomics datatable.",
  };
}
