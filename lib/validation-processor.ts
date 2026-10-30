import type {
  Indicator,
  IndicatorResult,
  ValidationResponse,
} from "./types";
import { validateIndicator } from "./indicator-validator";

/**
 * Executes live validation across an array of indicators using a controlled
 * 4-worker concurrency pool to prevent bandwidth exhaustion, timeout cascades,
 * and external rate-limiting.
 */
export async function processValidation(
  indicators: Indicator[],
  country = "Papua New Guinea",
  countryCode = "PG",
  datasetName?: string
): Promise<ValidationResponse> {
  const CONCURRENCY = 4;
  const results: IndicatorResult[] = new Array(indicators.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < indicators.length) {
      const idx = currentIndex++;
      const indicator = indicators[idx];
      try {
        results[idx] = await validateIndicator(indicator);
      } catch (error) {
        results[idx] = {
          indicator_id: indicator.indicator_id,
          display_name: indicator.display_name,
          source_url: indicator.source_url,
          source_value: null,
          ui_value: indicator.ui_value,
          tolerance: indicator.tolerance,
          difference: null,
          status: "ERROR" as const,
          is_matched: false,
          message:
            error instanceof Error
              ? error.message
              : "Unexpected validation failure.",
          screen_section: indicator.screen_section,
          where_it_shows: indicator.where_it_shows,
          is_reachability: indicator.is_reachability,
        };
      }
    }
  }

  const workerCount = Math.min(CONCURRENCY, indicators.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  let matched = 0;
  let mismatched = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of results) {
    switch (r.status) {
      case "SUCCESS":
        if (r.is_matched) matched++;
        else mismatched++;
        break;
      case "SKIPPED":
        skipped++;
        break;
      case "ERROR":
        errors++;
        break;
    }
  }

  const overall_status = mismatched === 0 && errors === 0;
  const now = new Date();
  const suffix = datasetName ? `-${datasetName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 10)}` : "";
  const testRunId = `RUN-${now.toISOString().slice(0, 10)}${suffix}-${String(now.getTime()).slice(-4)}`;

  return {
    test_run_id: testRunId,
    executed_at: now.toISOString(),
    country,
    country_code: countryCode,
    summary: {
      total_indicators: results.length,
      matched,
      mismatched,
      skipped,
      errors,
      overall_status,
    },
    results,
  };
}
