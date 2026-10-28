import type { ScrapeConfig } from "./types";

export interface ScrapeRuleContext {
  field?: string;
  category?: string;
  url?: string;
  countryName?: string;
}

/**
 * Auto-generates a ScrapeConfig for web scraping or PDF extraction
 * based on the target URL, category, and field metadata.
 */
export function generateScrapeConfig(ctx: ScrapeRuleContext): ScrapeConfig | null {
  const url = (ctx.url || "").toLowerCase();
  const field = (ctx.field || "").toLowerCase();
  const cat = (ctx.category || "").toLowerCase();
  const countryName = ctx.countryName || "Papua New Guinea";

  // Check if target is a PDF
  const isPdf = url.split("?")[0].endsWith(".pdf");

  // 1. TradingEconomics - REPO / Interest Rate
  if (url.includes("tradingeconomics.com") && (url.includes("interest-rate") || field.includes("repo"))) {
    return {
      regex: "last recorded at ([\\d.]+) percent",
    };
  }

  // 2. TradingEconomics - Corporate Tax Rate
  if (url.includes("tradingeconomics.com") && (url.includes("corporate-tax") || field.includes("tax"))) {
    return {
      regex: "(\\d+)\\s*percent",
    };
  }

  // 3. TradingEconomics - Currency / FX Rate
  if (url.includes("tradingeconomics.com") && (url.includes("currency") || field.includes("fx"))) {
    return {
      regex: "(\\d+\\.\\d+)",
    };
  }

  // 4. Green Climate Fund (GCF)
  if (url.includes("greenclimate.fund") || field.includes("gcf")) {
    return {
      regex: countryName,
      value_if_found: "Yes",
    };
  }

  // 5. Utility Tariff (PNG Power or similar)
  if (url.includes("pngpower.com.pg") || field.includes("tariff")) {
    return {
      content_type: isPdf ? "pdf" : "html",
      regex: "(\\d+\\.\\d+)\\s*(?:USD|toea|t|Kina)/(?:kWh|L)",
    };
  }

  // 6. Fuel Price (ICCC or similar)
  if (url.includes("iccc.gov.pg") || field.includes("diesel") || field.includes("fuel")) {
    return {
      content_type: isPdf ? "pdf" : "html",
      regex: "(?:diesel|fuel|petrol).*?(\\d+\\.\\d+)",
    };
  }

  // 7. World Bank IDA or financial PDFs
  if (isPdf && (url.includes("worldbank.org") || cat.includes("ida"))) {
    if (field.includes("tenor") || field.includes("tenure")) {
      return {
        content_type: "pdf",
        regex: "(\\d+)\\s*(?:years|yrs)",
      };
    }
    return {
      content_type: "pdf",
      regex: "([\\d.]+)%",
    };
  }

  // 8. Generic PDF fallback
  if (isPdf) {
    return {
      content_type: "pdf",
      regex: "([\\d,]+\\.?\\d*)",
    };
  }

  // 9. Generic HTML fallback
  return {
    regex: "([\\d,]+\\.?\\d*)",
  };
}
