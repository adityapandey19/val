import * as cheerio from "cheerio";
import type { XmlConfig } from "./types";

/**
 * Checks whether the given HTTP content-type or response text represents XML/RSS/Atom.
 */
export function isXmlContent(contentType: string, rawText: string): boolean {
  const ct = (contentType || "").toLowerCase();
  if (
    ct.includes("xml") ||
    ct.includes("application/rss+xml") ||
    ct.includes("application/atom+xml")
  ) {
    return true;
  }
  const trimmed = (rawText || "").trim().toLowerCase();
  return (
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<rss") ||
    trimmed.startsWith("<feed") ||
    trimmed.startsWith("<atom") ||
    trimmed.startsWith("<rdf:rdf")
  );
}

/**
 * Parses XML/RSS/Atom content using Cheerio's native XML mode and extracts the desired value.
 */
export function extractXmlValue(
  xmlText: string,
  config?: XmlConfig | null,
  uiValue?: string | number
): string | number {
  if (!xmlText || xmlText.trim() === "") {
    throw new Error("Empty XML response received.");
  }

  const $ = cheerio.load(xmlText, { xmlMode: true });

  // Locate all feed items (RSS <item> or Atom <entry>)
  const items = $("item, entry");
  const count = items.length;

  // 1. Explicit xml_path (custom selector or tag path)
  if (config?.xml_path) {
    const el = $(config.xml_path).first();
    if (el.length === 0) {
      throw new Error(`XML selector "${config.xml_path}" matched no elements.`);
    }
    const text = el.text().trim();
    if (!text) {
      throw new Error(`XML selector "${config.xml_path}" matched an empty element.`);
    }
    const num = Number(text.replace(/,/g, ""));
    return Number.isNaN(num) ? text : num;
  }

  // 2. Extraction mode: item_count
  if (config?.extraction_mode === "item_count") {
    return count;
  }

  // 3. Extraction mode: latest_title
  if (config?.extraction_mode === "latest_title") {
    const firstTitle = items.first().find("title").text().trim() || $("channel > title").text().trim();
    if (firstTitle) {
      return firstTitle;
    }
    throw new Error("No title element found in XML feed.");
  }

  // 4. Keyword matching mode
  const keyword = config?.keyword || (typeof uiValue === "string" && uiValue !== "Active" ? uiValue : null);
  if (keyword) {
    const kwLower = keyword.toLowerCase().trim();
    let found = false;
    items.each((_, el) => {
      const title = $(el).find("title").text().toLowerCase();
      const desc = $(el).find("description, summary, content").text().toLowerCase();
      if (title.includes(kwLower) || desc.includes(kwLower)) {
        found = true;
        return false; // Break loop
      }
    });

    if (found) {
      return config?.value_if_found !== undefined ? config.value_if_found : "Active";
    }
  }

  // 5. Default smart extraction based on ui_value
  if (typeof uiValue === "number") {
    return count;
  }

  const uiStr = String(uiValue ?? "").trim().toLowerCase();
  if (uiStr.includes("active") || uiStr === "") {
    return count > 0 ? `Active (${count} items)` : "Active";
  }

  // If ui_value matches any item headline directly
  let matchingTitle: string | null = null;
  items.each((_, el) => {
    const title = $(el).find("title").text().trim();
    if (
      title.toLowerCase().includes(uiStr) ||
      uiStr.includes(title.toLowerCase())
    ) {
      matchingTitle = title;
      return false;
    }
  });

  if (matchingTitle) {
    return matchingTitle;
  }

  // Fallback to active count if feed has items
  if (count > 0) {
    return `Active (${count} items)`;
  }

  return "Active (0 items)";
}
