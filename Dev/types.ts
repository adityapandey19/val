/**
 * Dev PNG Scrape Validator — Extended Types
 * Built on top of Danish's core types, extended for HTML scraping,
 * review statuses, and rich source metadata.
 */

export type ExtendedIndicatorStatus = "SUCCESS" | "SKIPPED" | "ERROR" | "UNDER_REVIEW";

export interface IndicatorSourceMetadata {
  readonly sourceType: "HTML_SCRAPE" | "JSON_API" | "INTERNAL_CALCULATED" | "INTERNAL_USER_INPUT" | "PDF_DOCUMENT";
  readonly provider: string;
  readonly periodOrDate?: string;
  readonly rawExtracted?: unknown;
  readonly reviewNotes?: string;
}

export interface PNGIndicator {
  readonly indicator_id: string;
  readonly category: string;
  readonly display_name: string;
  readonly source_url: string;
  readonly json_path: string | null;
  readonly ui_value: number | string;
  readonly unit: string;
  readonly tolerance: number;
  readonly is_scrape_target?: boolean;
}

export interface PNGIndicatorResult {
  readonly indicator_id: string;
  readonly display_name: string;
  readonly category: string;
  readonly source_url: string;
  readonly source_value: number | string | null;
  readonly ui_value: number | string;
  readonly unit: string;
  readonly tolerance: number;
  readonly difference: number | null;
  readonly status: ExtendedIndicatorStatus;
  readonly is_matched: boolean;
  readonly message: string | null;
  readonly metadata?: IndicatorSourceMetadata;
}

export interface PNGValidationSummary {
  readonly total_indicators: number;
  readonly scrape_targets: number;
  readonly api_targets: number;
  readonly matched: number;
  readonly mismatched: number;
  readonly under_review: number;
  readonly skipped: number;
  readonly errors: number;
  readonly pass_rate_pct: number;
  readonly overall_status: boolean;
}

export interface PNGValidationResponse {
  readonly test_run_id: string;
  readonly execution_mode: "LIVE" | "FIXTURE_OFFLINE";
  readonly executed_at: string;
  readonly country: string;
  readonly country_code: string;
  readonly iso3: string;
  readonly summary: PNGValidationSummary;
  readonly results: PNGIndicatorResult[];
}
