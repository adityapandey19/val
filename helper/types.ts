// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export interface ProjectMetadata {
  readonly country: string;
  readonly country_code: string;
  readonly iso3: string;
  readonly province: string;
  readonly coordinates: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly grid_connection_type: string;
  readonly distance_to_grid_km: number;
}

/**
 * Configuration for scraping HTML pages or extracting data from PDFs.
 * Used when `json_path` is null and the source is an external URL.
 *
 * Extraction strategy (in order of precedence):
 *  1. `css_selector` — query an HTML element and read its text content
 *  2. `regex` — apply a regex with a capture group to the page text / PDF text
 *  3. `meta_name` — read a `<meta name="..." content="...">` tag value
 */
export interface ScrapeConfig {
  /** CSS selector to locate the element (e.g. "#ticker-value", "td.rate"). */
  readonly css_selector?: string;

  /**
   * Regex pattern (string) applied to the text content of the page or PDF.
   * Must contain exactly one capture group whose match is the extracted value.
   * Example: `"last recorded at ([\\d.]+) percent"`
   */
  readonly regex?: string;

  /** Name attribute of a <meta> tag to read the content from. */
  readonly meta_name?: string;

  /**
   * Set to `"pdf"` when the source_url points to a PDF file.
   * When set, the system downloads the PDF, extracts its text,
   * and applies `regex` to find the value.
   */
  readonly content_type?: "html" | "pdf";

  /**
   * Optional static value returned if the selector/regex successfully matches.
   * Ideal for existence/eligibility checks (e.g. "Yes").
   */
  readonly value_if_found?: string | number;
}

export interface Indicator {
  readonly indicator_id: string;
  readonly category: string;
  readonly display_name: string;
  readonly source_url: string;
  readonly json_path: string | null;
  readonly ui_value: number | string;
  readonly unit: string;
  readonly tolerance: number;
  /** Optional scraping configuration for HTML / PDF sources. */
  readonly scrape_config?: ScrapeConfig | null;
}


export interface ValidationRequest {
  readonly request_id: string;
  readonly timestamp: string;
  readonly project_metadata: ProjectMetadata;
  readonly indicators: Indicator[];
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type IndicatorStatus = "SUCCESS" | "SKIPPED" | "ERROR";

export interface IndicatorResult {
  readonly indicator_id: string;
  readonly display_name: string;
  readonly source_url: string;
  readonly source_value: number | string | null;
  readonly ui_value: number | string;
  readonly tolerance: number;
  readonly difference: number | null;
  readonly status: IndicatorStatus;
  readonly is_matched: boolean;
  readonly message: string | null;
}

export interface ValidationSummary {
  readonly total_indicators: number;
  readonly matched: number;
  readonly mismatched: number;
  readonly skipped: number;
  readonly errors: number;
  readonly overall_status: boolean;
}

export interface ValidationResponse {
  readonly test_run_id: string;
  readonly executed_at: string;
  readonly country: string;
  readonly country_code: string;
  readonly summary: ValidationSummary;
  readonly results: IndicatorResult[];
}
