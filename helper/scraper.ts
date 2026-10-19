import * as cheerio from "cheerio";
import type { ScrapeConfig } from "./types";

/** Timeout in milliseconds for fetching scrape targets. */
const SCRAPE_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// PDF text extraction  (lazy-loaded to avoid bundling when unused)
// ---------------------------------------------------------------------------

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Dynamic import so pdf-parse is only loaded when actually needed.
  const { PDFParse } = await import("pdf-parse");

  // Ensure worker path is explicitly defined to avoid Turbopack / bundler path resolution errors
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
 * Strips common formatting (commas, currency symbols, trailing %).
 * Returns the original string if it can't be parsed as a number.
 */
function parseScrapedValue(raw: string): number | string {
  const cleaned = raw
    .replace(/[$€£¥₤₹]/g, "")  // currency symbols
    .replace(/,/g, "")           // thousands separators
    .replace(/%\s*$/, "")        // trailing percent
    .trim();

  const num = Number(cleaned);
  return Number.isNaN(num) ? raw.trim() : num;
}

// ---------------------------------------------------------------------------
// Main scraper
// ---------------------------------------------------------------------------

/**
 * Scrapes a value from an HTML page or PDF using the provided ScrapeConfig.
 *
 * Returns the extracted value (number or string), or throws an Error
 * with a descriptive message if extraction fails.
 */
export async function scrapeValue(
  sourceUrl: string,
  config: ScrapeConfig
): Promise<number | string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        // Use a browser-like User-Agent to avoid being blocked
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          config.content_type === "pdf"
            ? "application/pdf"
            : "text/html,application/xhtml+xml,*/*",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const isPdf =
      config.content_type === "pdf" ||
      sourceUrl.toLowerCase().split("?")[0].endsWith(".pdf") ||
      (response.headers.get("content-type")?.includes("application/pdf") ?? false);

    const finalize = (raw: string): number | string =>
      config.value_if_found !== undefined ? config.value_if_found : parseScrapedValue(raw);

    // ── PDF extraction ──────────────────────────────────────────────────
    if (isPdf) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const text = await extractPdfText(buffer);

      if (!config.regex) {
        throw new Error(
          "PDF sources require a `regex` in scrape_config to extract the value."
        );
      }

      const match = text.match(new RegExp(config.regex, "i"));
      const extracted = match ? (match[1] !== undefined ? match[1] : match[0]) : null;
      if (!extracted) {
        throw new Error(
          `Regex "${config.regex}" did not match any content in the PDF.`
        );
      }

      return finalize(extracted);
    }

    // ── HTML extraction ─────────────────────────────────────────────────
    const html = await response.text();
    const $ = cheerio.load(html);

    // Strategy 1: CSS selector (optionally refined with regex)
    if (config.css_selector) {
      const el = $(config.css_selector).first();
      if (el.length === 0) {
        throw new Error(
          `CSS selector "${config.css_selector}" matched no elements.`
        );
      }
      const text = el.text().trim();
      if (config.regex) {
        const match = text.match(new RegExp(config.regex, "i"));
        const extracted = match ? (match[1] !== undefined ? match[1] : match[0]) : null;
        if (extracted) {
          return finalize(extracted);
        }
      } else {
        if (!text) {
          throw new Error(
            `CSS selector "${config.css_selector}" matched an empty element.`
          );
        }
        return finalize(text);
      }
    }

    // Strategy 2: Regex on visible text or raw HTML
    if (config.regex) {
      const pageText = $("body").text();
      let match = pageText.match(new RegExp(config.regex, "i"));
      if (!match) {
        match = html.match(new RegExp(config.regex, "i"));
      }
      const extracted = match ? (match[1] !== undefined ? match[1] : match[0]) : null;
      if (!extracted) {
        throw new Error(
          `Regex "${config.regex}" did not match any content on the page.`
        );
      }
      return finalize(extracted);
    }

    // Strategy 3: Meta tag
    if (config.meta_name) {
      const content = $(`meta[name="${config.meta_name}"]`).attr("content");
      if (!content) {
        throw new Error(
          `Meta tag with name="${config.meta_name}" not found.`
        );
      }
      return finalize(content);
    }

    throw new Error(
      "scrape_config must include at least one of: css_selector, regex, or meta_name."
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
