import * as cheerio from "cheerio";
import type { ScrapeConfig } from "./types";
import { extractValueFromPdfText } from "./pdf-extractor";

/** Timeout in milliseconds for fetching scrape targets (increased for slow connections). */
const SCRAPE_TIMEOUT_MS = 25_000;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
];

// ---------------------------------------------------------------------------
// PDF text extraction (lazy-loaded to avoid bundling when unused)
// ---------------------------------------------------------------------------

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");

  try {
    const path = await import("path");
    const fs = await import("fs");
    const workerPath = path.resolve(
      process.cwd(),
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
    );
    if (fs.existsSync(workerPath)) {
      PDFParse.setWorker(workerPath);
    }
  } catch {
    // Fall back to default worker resolution
  }

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const textResult = await parser.getText();
  return textResult.text;
}

// ---------------------------------------------------------------------------
// Value parsing helper
// ---------------------------------------------------------------------------

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

      // If successful or 404 (not worth retrying UA), return
      if (res.ok || res.status === 404) {
        return res;
      }

      // If blocked with 403 or 429, retry with next User-Agent
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
// Main scraper
// ---------------------------------------------------------------------------

/**
 * Scrapes a value from an HTML page or PDF using the provided ScrapeConfig.
 */
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

  // 1. Check for Linked PDF Auto-Discovery (e.g. "Website / PDF" or press notices)
  if (config.follow_pdf_links) {
    let pdfUrl: string | null = null;
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href && href.toLowerCase().includes(".pdf")) {
        try {
          pdfUrl = new URL(href, sourceUrl).href;
          return false; // Break
        } catch {
          // Ignore invalid URL
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
          // If regex doesn't match in PDF, fall through to HTML extraction
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

  // 3. Strategy 2: Meta tags (name or property)
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

    // First attempt on visible body text
    const pageText = $("body").text();
    let match = pageText.match(regex);

    // Second attempt on meta description (crucial for client-side rendered SPAs)
    if (!match) {
      const metaDesc =
        $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content") ||
        $('meta[name="twitter:description"]').attr("content") ||
        "";
      match = metaDesc.match(regex);
    }

    // Third attempt on raw HTML
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
