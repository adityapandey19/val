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

export interface Indicator {
  readonly indicator_id: string;
  readonly category: string;
  readonly display_name: string;
  readonly source_url: string;
  readonly json_path: string | null;
  readonly ui_value: number | string;
  readonly unit: string;
  readonly tolerance: number;
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
