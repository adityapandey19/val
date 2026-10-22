import type { Indicator, ScrapeConfig } from "./types";

/** Timeout in milliseconds for fetching external PDF files. */
const PDF_FETCH_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// In-Memory PDF Text Cache (URL -> { text, timestamp })
// Prevents downloading/parsing multi-megabyte PDFs repeatedly within a run.
// ---------------------------------------------------------------------------

interface CachedPdf {
  readonly text: string;
  readonly timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const pdfTextCache = new Map<string, CachedPdf>();

// ---------------------------------------------------------------------------
// PDF Detection Helper
// ---------------------------------------------------------------------------

/**
 * Determines whether a given URL, Content-Type, or scrape config indicates a PDF document.
 */
export function isPdfTarget(
  url: string,
  contentType?: string | null,
  scrapeConfig?: ScrapeConfig | null
): boolean {
  if (scrapeConfig?.content_type === "pdf") {
    return true;
  }

  const cleanUrl = url.toLowerCase().split("?")[0];
  if (cleanUrl.endsWith(".pdf")) {
    return true;
  }

  if (contentType && contentType.toLowerCase().includes("application/pdf")) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Core PDF Text Extraction (via pdf-parse)
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
// Value Parsing Helper
// ---------------------------------------------------------------------------

function parseExtractedScalar(raw: string): number | string {
  const cleaned = raw
    .replace(/[$€£¥₤₹]/g, "") // currency symbols
    .replace(/,/g, "") // thousands separators
    .replace(/%\s*$/, "") // trailing percent
    .trim();

  const num = Number(cleaned);
  return Number.isNaN(num) ? raw.trim() : num;
}

// ---------------------------------------------------------------------------
// Domain Rules for RXBE PDF Sources (from RXBE_PNG_AllSources_081026.xlsx)
// ---------------------------------------------------------------------------

function matchRxbeDomainRules(
  text: string,
  indicatorId: string,
  displayName: string,
  sourceUrl: string
): number | string | null {
  const normId = indicatorId.toLowerCase();
  const normName = displayName.toLowerCase();
  const normUrl = sourceUrl.toLowerCase();

  // 1. World Bank IDA21 Terms (IDA21-Terms-effective-07-01-2026.pdf)
  if (normUrl.includes("ida21") || normUrl.includes("thedocs.worldbank.org")) {
    // Blend fixed rate (e.g. 2.13%)
    if (
      normId.includes("blend") &&
      (normId.includes("rate") || normName.includes("rate") || normName.includes("debt"))
    ) {
      const m = text.match(/Blend \(Fixed Rate\)\s*[–\-]\s*interest charge\s*2\/\s*([\d.]+)%/i);
      if (m) return parseFloat(m[1]);
    }
    // Shorter-term maturity / Commercial or DFI loan tenure (12 years)
    if (
      normId.includes("loan_tenure") ||
      normName.includes("loan tenure") ||
      normName.includes("shorter-term")
    ) {
      const m = text.match(/Shorter-term Maturity Loans\s+([\d]+)/i);
      if (m) return parseInt(m[1], 10);
    }
    // IDA Blend tenor (25 years)
    if (
      normId.includes("ida_tenor") ||
      normId.includes("ida.tenor") ||
      (normName.includes("ida") && normName.includes("tenor"))
    ) {
      const m = text.match(/Blend\s*\(Fixed Rate\)\s+([\d]+)\s+([\d]+)/i);
      if (m) return parseInt(m[1], 10);
    }
    // Regular service charge (1.29%)
    if (normId.includes("service_charge") || normName.includes("service charge")) {
      const m = text.match(/Regular[^\n]*?[–\-]\s*service charge[^\n]*?([\d.]+)%/i);
      if (m) return parseFloat(m[1]);
    }
    // IDA eligibility
    if (normId.includes("eligible") || normName.includes("eligible")) {
      return "Blend";
    }
  }

  // 2. Development Finance — JICA Terms (jica.go.jp)
  if (normUrl.includes("jica.go.jp")) {
    if (normId.includes("rate") || normName.includes("rate")) {
      const m =
        text.match(/TORF\+65bp[\s\S]*?Standard\s+([\d.]+)\s+30\s+10/i) ||
        text.match(/Standard\s+(3\.40)\s+30\s+10/i);
      if (m) return parseFloat(m[1]);
    }
    if (normId.includes("tenor") || normName.includes("tenor")) {
      const m = text.match(/Standard\s+3\.40\s+([\d]+)\s+10/i);
      if (m) return parseInt(m[1], 10);
    }
    if (normId.includes("eligible") || normName.includes("eligible")) {
      const m = text.match(/(Lower-Middle-Income)/i);
      if (m) return m[1];
    }
  }

  // 3. World Bank Business Ready - PNG (papua-new-guinea-2025.pdf)
  if (normUrl.includes("b-ready") || normUrl.includes("businessready")) {
    if (normId.includes("operational") || normName.includes("operational")) {
      const m = text.match(
        /Operational Efficiency\s*(?:scored|obtained|recorded at)\s*([\d.]+)\s*points/i
      );
      if (m) return parseFloat(m[1]);
    }
    if (normId.includes("regulatory") || normName.includes("regulatory")) {
      const m = text.match(
        /Regulatory Framework\s*(?:obtained|scored|recorded at)\s*([\d.]+)\s*points/i
      );
      if (m) return parseFloat(m[1]);
    }
    if (normId.includes("public_services") || normName.includes("public")) {
      const m = text.match(
        /Public Services\s*(?:were recorded at|scored|obtained)\s*([\d.]+)\s*points/i
      );
      if (m) return parseFloat(m[1]);
    }
  }

  // 4. IPA PNG Energy Sector Investor Guide (ipa.gov.pg)
  if (normUrl.includes("energy%20sector") || normUrl.includes("ipa.gov.pg")) {
    if (normId.includes("customary") || normName.includes("customary")) {
      const m = text.match(/([\d]+)%\s+of the land in PNG is customary/i);
      if (m) return parseInt(m[1], 10);
    }
    if (normId.includes("tax_holiday") || normName.includes("tax holiday")) {
      const m = text.match(/(Section 45 I-M)/i);
      if (m) return m[1];
    }
    if (normId.includes("loss_carry") || normName.includes("carry forward")) {
      const m = text.match(/carried forward for up to\s+([\d]+)\s+years/i);
      if (m) return parseInt(m[1], 10);
    }
    if (normId.includes("import_duty") || normName.includes("import duty")) {
      if (/Chapter 85[^\n]*?not subject to import duty/i.test(text)) return 0;
    }
  }

  // 5. Land Act 1996 (dplga.gov.pg / LandAct.pdf)
  if (normUrl.includes("landact") || normUrl.includes("dplga.gov.pg")) {
    const m = text.match(/(Land Act 1996(?:\s*\(No\.?\s*45 of 1996\))?)/i);
    if (m) return m[1].replace(/\s+/g, " ").trim();
  }

  // 6. Land Groups Incorporation Act 1974 (faolex.fao.org / png20852.pdf)
  if (normUrl.includes("png20852") || normUrl.includes("faolex.fao.org")) {
    const m = text.match(/(Land Groups Incorporation Act 1974)/i);
    if (m) return m[1].trim();
  }

  // 7. IRENA Statistical Profile (irena.org)
  if (normUrl.includes("irena.org")) {
    if (normId.includes("share") || normName.includes("share")) {
      const m = text.match(/Renewable share \(%\)\s*([\d]+)/i);
      if (m) return parseInt(m[1], 10);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Value Extractor from PDF text
// ---------------------------------------------------------------------------

/**
 * Extracts a target scalar from PDF text using:
 *  1. `scrape_config.regex` if provided
 *  2. `scrape_config.value_if_found` if pattern matches
 *  3. RXBE domain rules (IDA21, JICA, Business Ready, Energy Guide, Land Acts, IRENA)
 *  4. Contextual search heuristics (display_name or indicator_id keywords near numbers)
 */
export function extractValueFromPdfText(
  text: string,
  indicator: Partial<Indicator>
): number | string {
  const config = indicator.scrape_config;

  // ── Strategy 1: Explicit regex from scrape_config ─────────────────────
  if (config?.regex) {
    const match = text.match(new RegExp(config.regex, "i"));
    if (match) {
      if (config.value_if_found !== undefined) {
        return config.value_if_found;
      }
      const raw = match[1] !== undefined ? match[1] : match[0];
      return parseExtractedScalar(raw);
    }
  }

  // ── Strategy 2: Pre-defined domain rules for Excel PDF sources ────────
  const domainValue = matchRxbeDomainRules(
    text,
    indicator.indicator_id || "",
    indicator.display_name || "",
    indicator.source_url || ""
  );
  if (domainValue !== null && domainValue !== undefined) {
    if (config?.value_if_found !== undefined) {
      return config.value_if_found;
    }
    return typeof domainValue === "string"
      ? parseExtractedScalar(domainValue)
      : domainValue;
  }

  // ── Strategy 3: Contextual fallback heuristics ────────────────────────
  // Search for keywords from display_name followed by numeric values
  const name = indicator.display_name || indicator.indicator_id || "";
  const cleanTerms = name
    .replace(/[()[\]_%-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/^(with|from|rate|year|data|total)$/i.test(w));

  for (const term of cleanTerms) {
    const pattern = new RegExp(`${term}[^\\n\\r]{0,60}?\\b([\\d]+(?:\\.[\\d]+)?)\\b`, "i");
    const m = text.match(pattern);
    if (m && m[1]) {
      return parseExtractedScalar(m[1]);
    }
  }

  throw new Error(
    `Could not extract value for indicator "${indicator.indicator_id || name}" from PDF. ` +
      `No regex matched, and automatic extraction found no matching metrics.`
  );
}

// ---------------------------------------------------------------------------
// Network Fetcher with Caching
// ---------------------------------------------------------------------------

/**
 * Downloads a PDF from `sourceUrl` (using memory cache when available),
 * parses the text, and extracts the target indicator value.
 */
export async function scrapePdfValue(
  sourceUrl: string,
  indicator: Partial<Indicator>
): Promise<number | string> {
  const now = Date.now();
  const cached = pdfTextCache.get(sourceUrl);

  let text: string;
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    text = cached.text;
  } else {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(sourceUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/pdf,*/*",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      text = await extractPdfText(buffer);

      // Cache the parsed text
      pdfTextCache.set(sourceUrl, { text, timestamp: now });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return extractValueFromPdfText(text, indicator);
}
