import { NextRequest, NextResponse } from "next/server";
import type {
  ValidationRequest,
  ValidationResponse,
  IndicatorResult,
  Indicator,
} from "@/helper/types";
import { validateIndicator } from "@/helper/indicator-validator";
import {
  loadPdfIndicators,
  loadWizardStep1Indicators,
} from "@/helper/excel-source-loader";

/**
 * Helper to execute validation for an array of indicators and construct
 * the standard ValidationResponse.
 */
async function processValidation(
  indicators: Indicator[],
  country = "Papua New Guinea",
  countryCode = "PG"
): Promise<ValidationResponse> {
  // Use a worker pool with max 4 concurrent requests to prevent bandwidth exhaustion,
  // Nominatim rate-limiting (max 1 req/sec), and timeout cascades on slower connections.
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
  const testRunId = `RUN-${now.toISOString().slice(0, 10)}-${String(now.getTime()).slice(-4)}`;

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

/**
 * Loads indicators according to the requested mode:
 *  - "wizard": All 34 Wizard Step 1 indicators from RXBE_Wizard_Step1_Sources_Keys.xlsx
 *  - "pdf": All 18 PDF source indicators from RXBE_live_Template.html
 */
function loadFallbackIndicators(mode: "wizard" | "pdf" = "wizard"): {
  indicators: Indicator[];
  country: string;
  countryCode: string;
} {
  try {
    const indicators =
      mode === "pdf" ? loadPdfIndicators() : loadWizardStep1Indicators();

    return {
      indicators,
      country: "Papua New Guinea",
      countryCode: "PG",
    };
  } catch (err) {
    console.error("Error loading indicators from source loader:", err);
    return { indicators: [], country: "Papua New Guinea", countryCode: "PG" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/data
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    let body: (Partial<ValidationRequest> & {
      pdf_only?: boolean;
      from_template?: boolean;
    }) = {};

    try {
      body = (await request.json()) ?? {};
    } catch {
      // Empty or invalid body: use default fallback indicators
    }

    let indicators: Indicator[] = [];
    let country = body.project_metadata?.country ?? "Papua New Guinea";
    let countryCode = body.project_metadata?.country_code ?? "PG";

    if (Array.isArray(body.indicators) && body.indicators.length > 0) {
      indicators = body.indicators;
    } else {
      const mode: "wizard" | "pdf" =
        body.pdf_only === true || body.from_template === true
          ? "pdf"
          : "wizard";

      const fallback = loadFallbackIndicators(mode);
      indicators = fallback.indicators;
      country = fallback.country;
      countryCode = fallback.countryCode;
    }

    if (indicators.length === 0) {
      return NextResponse.json(
        {
          message:
            "Invalid request: `indicators` array is required or could not be loaded.",
        },
        { status: 400 }
      );
    }

    const response = await processValidation(indicators, country, countryCode);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("POST /api/data error:", error);
    return NextResponse.json(
      {
        message: "Something went wrong during validation.",
      },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/data
// Query parameters:
//   - ?pdf_only=true    -> Validates the 18 PDF source indicators
//   - default           -> Validates the 34 Wizard Step 1 indicators
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isPdfOnly = searchParams.get("pdf_only") === "true";
    const mode: "wizard" | "pdf" = isPdfOnly ? "pdf" : "wizard";

    const fallback = loadFallbackIndicators(mode);

    if (fallback.indicators.length === 0) {
      return NextResponse.json(
        { message: "No indicators found to validate." },
        { status: 404 }
      );
    }

    const response = await processValidation(
      fallback.indicators,
      fallback.country,
      fallback.countryCode
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("GET /api/data error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}