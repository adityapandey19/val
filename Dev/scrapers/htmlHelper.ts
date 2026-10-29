/**
 * Lightweight HTML parser utility for table rows and text extraction
 * Works natively in Node.js without any external dependencies.
 */

export interface ParsedTableRow {
  readonly cells: string[];
  readonly rawText: string;
}

export function parseHtmlTableRows(html: string): ParsedTableRow[] {
  const rows: ParsedTableRow[] = [];
  const trMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const tr of trMatches) {
    const rowHtml = tr[1];
    const cellMatches = rowHtml.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi);
    const cells: string[] = [];

    for (const cell of cellMatches) {
      const cleaned = cleanHtmlText(cell[1]);
      cells.push(cleaned);
    }

    if (cells.length > 0) {
      rows.push({
        cells,
        rawText: cells.join(" "),
      });
    }
  }

  return rows;
}

export function cleanHtmlText(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
