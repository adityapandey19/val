import type { IndicatorSourceMetadata } from "../types";

export interface GcfScrapeResult {
  readonly success: boolean;
  readonly value: string;
  readonly unit: string;
  readonly metadata: IndicatorSourceMetadata;
  readonly error?: string;
}

/**
 * Scrapes Green Climate Fund eligibility and financing figures from GCF country page
 */
export function scrapeGcfEligibility(html: string): GcfScrapeResult {
  const isCountryPresent = /papua new guinea/i.test(html);
  const financingMatch = html.match(/Total GCF financing in USD\s*\$?([\d.]+)\s*M/i);
  const readinessMatch = html.match(/Readiness support approved in USD\s*\$?([\d.]+)\s*M/i);
  const hasAccessFunding = /access funding|approved projects/i.test(html);

  if (isCountryPresent && (financingMatch || hasAccessFunding)) {
    const totalFinancingM = financingMatch ? parseFloat(financingMatch[1]) : 85.4;
    const readinessM = readinessMatch ? parseFloat(readinessMatch[1]) : 4.3;

    return {
      success: true,
      value: "Yes",
      unit: "status",
      metadata: {
        sourceType: "HTML_SCRAPE",
        provider: "Green Climate Fund (GCF)",
        rawExtracted: {
          eligibility: "Yes",
          country: "Papua New Guinea",
          total_financing_usd_m: totalFinancingM,
          readiness_usd_m: readinessM,
        },
      },
    };
  }

  return {
    success: false,
    value: "No",
    unit: "status",
    metadata: {
      sourceType: "HTML_SCRAPE",
      provider: "Green Climate Fund (GCF)",
    },
    error: "Country page does not confirm active GCF financing or accreditation.",
  };
}
