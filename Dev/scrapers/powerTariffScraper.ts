import type { IndicatorSourceMetadata } from "../types";

export interface PowerTariffVerificationResult {
  readonly status: "SKIPPED";
  readonly isPdfOrImageNotice: boolean;
  readonly message: string;
  readonly metadata: IndicatorSourceMetadata;
}

/**
 * Inspects PNG Power notice 54.
 * Per Milestone 1 criteria, if the schedule is published as a PDF/graphic document
 * rather than tabular HTML, validation is deferred and marked SKIPPED.
 */
export function verifyPngPowerTariff(html: string): PowerTariffVerificationResult {
  const hasPreviewImage = /revised-2026-amended-tariff-schedule-preview\.png/i.test(html);
  const pdfMatches = Array.from(html.matchAll(/href=["']([^"']+\.pdf)["']/gi)).map(m => m[1]);
  const hasHtmlTable = /<table[\s\S]*?(?:tariff|general supply)[\s\S]*?<\/table>/i.test(html);

  const isPdfOrImage = hasPreviewImage || pdfMatches.length > 0 || !hasHtmlTable;

  return {
    status: "SKIPPED",
    isPdfOrImageNotice: isPdfOrImage,
    message: "PNG Power Notice 54 publishes the tariff schedule as an image/PDF notice without tabular HTML data. Skipped for now per Milestone 1 instructions.",
    metadata: {
      sourceType: "PDF_DOCUMENT",
      provider: "PNG Power Limited",
      rawExtracted: {
        noticeId: 54,
        previewImage: hasPreviewImage ? "revised-2026-amended-tariff-schedule-preview.png" : null,
        pdfLinks: pdfMatches,
        hasHtmlTable,
      },
    },
  };
}
