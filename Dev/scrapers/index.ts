import fs from "fs";
import path from "path";
import { scrapeTradingEconomicsInterestRate, scrapeTradingEconomicsCorporateTax } from "./tradingEconomicsScraper";
import { scrapeGcfEligibility } from "./gcfScraper";
import { scrapeDamodaranCostOfEquity } from "./damodaranScraper";
import { scrapePwcCorporateTax } from "./pwcTaxScraper";
import { verifyPngPowerTariff } from "./powerTariffScraper";
import { evaluateDieselDisplacementCost } from "./dieselScraper";
import type { IndicatorSourceMetadata } from "../types";

export interface ScrapedResult {
  readonly status: "SUCCESS" | "SKIPPED" | "ERROR" | "UNDER_REVIEW";
  readonly sourceValue: number | string | null;
  readonly message: string | null;
  readonly metadata: IndicatorSourceMetadata;
  readonly wasFixtureUsed: boolean;
}

const FIXTURES_DIR = path.join(process.cwd(), "Dev", "fixtures");

const FIXTURE_MAP: Record<string, string> = {
  central_bank_repo_rate: "tradingeconomics_interest_rate.html",
  corporate_tax_rate: "tradingeconomics_tax.html",
  corporate_tax_rate_pwc: "pwc_png_tax.html",
  gcf_eligibility: "gcf_png.html",
  cost_of_equity_ke: "damodaran_ctryprem.html",
  grid_electricity_tariff: "pngpower_tariff_notice54.html",
};

/**
 * Fetch HTML from live URL with standard browser User-Agent, with timeout.
 */
async function fetchHtml(url: string, timeoutMs: number = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Loads cached fixture HTML from Dev/fixtures
 */
function loadFixtureHtml(fixtureFilename: string): string {
  const filePath = path.join(FIXTURES_DIR, fixtureFilename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8");
  }
  throw new Error(`Fixture file not found: ${filePath}`);
}

/**
 * Universal Scraper dispatcher for HTML indicators
 */
export async function scrapeIndicator(
  indicatorId: string,
  sourceUrl: string,
  mode: "LIVE" | "FIXTURE_OFFLINE" = "LIVE"
): Promise<ScrapedResult> {
  // Special Case 1: Diesel Displacement Cost — marked for review
  if (indicatorId === "diesel_displacement_cost") {
    const review = evaluateDieselDisplacementCost();
    return {
      status: review.status,
      sourceValue: review.sourceValue,
      message: review.message,
      metadata: review.metadata,
      wasFixtureUsed: false,
    };
  }

  // Retrieve HTML either via live fetch or offline fixture
  let html = "";
  let wasFixtureUsed = false;
  const fixtureName = FIXTURE_MAP[indicatorId];

  if (mode === "FIXTURE_OFFLINE" && fixtureName) {
    html = loadFixtureHtml(fixtureName);
    wasFixtureUsed = true;
  } else {
    try {
      html = await fetchHtml(sourceUrl);
    } catch (fetchErr) {
      // Fallback to fixture if network fails or 403 occurs
      if (fixtureName) {
        try {
          html = loadFixtureHtml(fixtureName);
          wasFixtureUsed = true;
        } catch {
          return {
            status: "ERROR",
            sourceValue: null,
            message: `Fetch failed (${(fetchErr as Error).message}) and no fixture available.`,
            metadata: { sourceType: "HTML_SCRAPE", provider: "Unknown" },
            wasFixtureUsed: false,
          };
        }
      } else {
        return {
          status: "ERROR",
          sourceValue: null,
          message: `Network fetch failed: ${(fetchErr as Error).message}`,
          metadata: { sourceType: "HTML_SCRAPE", provider: "Unknown" },
          wasFixtureUsed: false,
        };
      }
    }
  }

  // Route to the appropriate scraper parser
  switch (indicatorId) {
    case "central_bank_repo_rate": {
      const res = scrapeTradingEconomicsInterestRate(html);
      return {
        status: res.success ? "SUCCESS" : "ERROR",
        sourceValue: res.value,
        message: res.error || null,
        metadata: res.metadata,
        wasFixtureUsed,
      };
    }

    case "corporate_tax_rate": {
      const res = scrapeTradingEconomicsCorporateTax(html);
      if (res.success) {
        return {
          status: "SUCCESS",
          sourceValue: res.value,
          message: null,
          metadata: res.metadata,
          wasFixtureUsed,
        };
      }
      // Fallback to PwC if TradingEconomics tax fails
      try {
        const pwcHtml = wasFixtureUsed ? loadFixtureHtml("pwc_png_tax.html") : await fetchHtml("https://taxsummaries.pwc.com/papua-new-guinea/corporate/taxes-on-corporate-income");
        const pwcRes = scrapePwcCorporateTax(pwcHtml);
        return {
          status: pwcRes.success ? "SUCCESS" : "ERROR",
          sourceValue: pwcRes.value,
          message: pwcRes.error || null,
          metadata: pwcRes.metadata,
          wasFixtureUsed,
        };
      } catch {
        return {
          status: "ERROR",
          sourceValue: null,
          message: res.error || "Failed to extract corporate tax rate.",
          metadata: res.metadata,
          wasFixtureUsed,
        };
      }
    }

    case "gcf_eligibility": {
      const res = scrapeGcfEligibility(html);
      return {
        status: res.success ? "SUCCESS" : "ERROR",
        sourceValue: res.value,
        message: res.error || null,
        metadata: res.metadata,
        wasFixtureUsed,
      };
    }

    case "cost_of_equity_ke": {
      const res = scrapeDamodaranCostOfEquity(html);
      return {
        status: res.success ? "SUCCESS" : "ERROR",
        sourceValue: res.value,
        message: res.error || null,
        metadata: res.metadata,
        wasFixtureUsed,
      };
    }

    case "grid_electricity_tariff": {
      const res = verifyPngPowerTariff(html);
      return {
        status: res.status,
        sourceValue: null,
        message: res.message,
        metadata: res.metadata,
        wasFixtureUsed,
      };
    }

    default:
      return {
        status: "SKIPPED",
        sourceValue: null,
        message: `No HTML scraper registered for indicator_id '${indicatorId}'.`,
        metadata: { sourceType: "HTML_SCRAPE", provider: "Unregistered" },
        wasFixtureUsed,
      };
  }
}
