import * as cheerio from "cheerio";
import type { ScrapeConfig } from "./types";
import { extractPdfText, extractValueFromPdfText } from "./pdf-extractor";

/** Timeout in milliseconds for fetching scrape targets (increased for slow connections). */
const SCRAPE_TIMEOUT_MS = 25_000;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
];

/**
 * Tries to coerce a raw scraped string into a number.
 * Strips currency symbols, toea, Kina, commas, and trailing %.
 */
export function parseScrapedValue(raw: string): number | string {
  const cleaned = raw
    .replace(/[$€£¥₤₹]/g, "")
    .replace(/\b(?:Kina|toea|PGK|FJD|USD|t)\b/gi, "")
    .replace(/,/g, "")
    .replace(/%\s*$/, "")
    .trim();

  const num = Number(cleaned);
  return Number.isNaN(num) ? raw.trim() : num;
}

// ---------------------------------------------------------------------------
// HTTP fetcher with anti-bot / 403 retry
// ---------------------------------------------------------------------------

async function fetchWithFallback(url: string, isPdfTarget: boolean): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i < USER_AGENTS.length; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        "User-Agent": USER_AGENTS[i],
        Accept: isPdfTarget
          ? "application/pdf,application/xhtml+xml,text/html,*/*"
          : "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      };

      const res = await fetch(url, {
        signal: controller.signal,
        headers,
      });

      clearTimeout(timeoutId);

      if (res.ok || res.status === 404) {
        return res;
      }

      if (res.status === 403 || res.status === 429) {
        lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
        continue;
      }

      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

// ---------------------------------------------------------------------------
// Damodaran Table Handler
// ---------------------------------------------------------------------------

function scrapeDamodaranTable(
  html: string,
  config: ScrapeConfig
): number | string | null {
  const $ = cheerio.load(html);
  const rows = $("tr");
  let targetRowCells: string[] | null = null;

  // Search for country row
  rows.each((_, el) => {
    const text = $(el).text();
    if (
      text.includes("Papua New Guinea") ||
      text.includes("Papua") ||
      (config.regex && new RegExp(config.regex, "i").test(text))
    ) {
      const cells: string[] = [];
      $(el).find("td").each((_idx, td) => {
        cells.push($(td).text().trim());
      });
      targetRowCells = cells;
      return false; // break
    }
  });

  if (targetRowCells) {
    const cells: string[] = targetRowCells;

    // Check cells for Rating (e.g. B2, Ba2, Aaa) or Equity Risk Premium (%)
    if (cells.length > 0) {
      // If regex provided, match across the row text or specific cells
      if (config.regex) {
        const rowStr = cells.join(" | ");
        const m = rowStr.match(new RegExp(config.regex, "i"));
        if (m) {
          const val = m[1] !== undefined ? m[1] : m[0];
          return parseScrapedValue(val);
        }
      }

      // Rating lookup
      const ratingCell = cells.find((c) => /^[A-D][a-z0-9+-]{0,4}$/i.test(c));
      if (config.attribute === "rating" && ratingCell) {
        return ratingCell;
      }

      // Equity Risk Premium cell (percentage like 11.35%)
      const erpCell = cells.find((c) => /^\d+\.\d+\s*%$/.test(c));
      if (erpCell) {
        return parseScrapedValue(erpCell);
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main scraper
// ---------------------------------------------------------------------------

export async function scrapeValue(
  sourceUrl: string,
  config: ScrapeConfig
): Promise<number | string> {
  const isDirectPdf =
    config.content_type === "pdf" ||
    sourceUrl.toLowerCase().split("?")[0].endsWith(".pdf");

  const response = await fetchWithFallback(sourceUrl, isDirectPdf);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const isPdf =
    isDirectPdf ||
    contentType.includes("application/pdf");

  const finalize = (raw: string): number | string =>
    config.value_if_found !== undefined ? config.value_if_found : parseScrapedValue(raw);

  // ── Route A: Direct PDF Extraction ─────────────────────────────────────────
  if (isPdf) {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = await extractPdfText(buffer);
    return extractValueFromPdfText(text, {
      source_url: sourceUrl,
      scrape_config: config,
    });
  }

  // ── Route B: HTML Extraction ───────────────────────────────────────────────
  const html = await response.text();
  const $ = cheerio.load(html);

  // Damodaran special handling
  if (sourceUrl.includes("ctryprem.html") || sourceUrl.includes("damodar")) {
    const damoVal = scrapeDamodaranTable(html, config);
    if (damoVal !== null && damoVal !== undefined) {
      return damoVal;
    }
  }

  // 1. Check for Linked PDF Auto-Discovery
  if (config.follow_pdf_links) {
    let pdfUrl: string | null = null;
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href && href.toLowerCase().includes(".pdf")) {
        try {
          pdfUrl = new URL(href, sourceUrl).href;
          return false;
        } catch {
          // Ignore
        }
      }
    });

    if (pdfUrl) {
      const pdfRes = await fetchWithFallback(pdfUrl, true);
      if (pdfRes.ok) {
        const arrayBuffer = await pdfRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const text = await extractPdfText(buffer);
        try {
          return extractValueFromPdfText(text, {
            source_url: pdfUrl,
            scrape_config: config,
          });
        } catch {
          // Fall through
        }
      }
    }
  }

  // 2. Strategy 1: CSS selector
  if (config.css_selector) {
    const el = $(config.css_selector).first();
    if (el.length > 0) {
      const rawText = config.attribute ? el.attr(config.attribute) || "" : el.text().trim();
      if (config.regex) {
        const match = rawText.match(new RegExp(config.regex, "i"));
        const extracted = match ? (match[1] !== undefined ? match[1] : match[0]) : null;
        if (extracted) {
          return finalize(extracted);
        }
      } else if (rawText) {
        return finalize(rawText);
      }
    }
  }

  // 3. Strategy 2: Meta tags
  if (config.meta_name) {
    const content =
      $(`meta[name="${config.meta_name}"]`).attr("content") ||
      $(`meta[property="${config.meta_name}"]`).attr("content") ||
      $(`meta[property="og:${config.meta_name}"]`).attr("content");

    if (content) {
      if (config.regex) {
        const match = content.match(new RegExp(config.regex, "i"));
        const extracted = match ? (match[1] !== undefined ? match[1] : match[0]) : null;
        if (extracted) {
          return finalize(extracted);
        }
      }
      return finalize(content);
    }
  }

  // 4. Strategy 3: Regex on visible body text, meta description, or raw HTML
  if (config.regex) {
    const regex = new RegExp(config.regex, "i");

    const pageText = $("body").text();
    let match = pageText.match(regex);

    if (!match) {
      const metaDesc =
        $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content") ||
        $('meta[name="twitter:description"]').attr("content") ||
        "";
      match = metaDesc.match(regex);
    }

    if (!match) {
      match = html.match(regex);
    }

    const extracted = match ? (match[1] !== undefined ? match[1] : match[0]) : null;
    if (extracted) {
      return finalize(extracted);
    }

    throw new Error(
      `Regex "${config.regex}" did not match any content on the page.`
    );
  }

  throw new Error(
    "scrape_config must include at least one of: css_selector, regex, or meta_name."
  );
}
