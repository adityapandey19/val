import type { IndicatorSourceMetadata } from "../types";

export interface PwcTaxScrapeResult {
  readonly success: boolean;
  readonly value: number | null;
  readonly unit: string;
  readonly metadata: IndicatorSourceMetadata;
  readonly error?: string;
}

/**
 * Scrapes PwC Worldwide Tax Summaries for PNG Corporate Income Tax rate
 */
export function scrapePwcCorporateTax(html: string): PwcTaxScrapeResult {
  const match = html.match(/resident companies[\s\S]{1,200}?(\d{2})%/i);

  if (match) {
    const rate = parseFloat(match[1]);
    return {
      success: true,
      value: rate,
      unit: "%",
      metadata: {
        sourceType: "HTML_SCRAPE",
        provider: "PwC Worldwide Tax Summaries",
        rawExtracted: {
          taxCategory: "Resident Companies Income Tax",
          ratePct: rate,
        },
      },
    };
  }

  return {
    success: false,
    value: null,
    unit: "%",
    metadata: {
      sourceType: "HTML_SCRAPE",
      provider: "PwC Worldwide Tax Summaries",
    },
    error: "PwC tax summary did not contain resident companies CIT percentage.",
  };
}
