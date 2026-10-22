import { NextRequest, NextResponse } from "next/server";
import type {
  ValidationRequest,
  ValidationResponse,
  IndicatorResult,
  Indicator,
} from "@/helper/types";
import { validateIndicator } from "@/helper/indicator-validator";
import {
  loadExcelApiIndicators,
  loadPdfIndicators,
  loadAllIndicators,
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
  const settledResults = await Promise.allSettled(
    indicators.map((indicator) => validateIndicator(indicator))
  );

  const results: IndicatorResult[] = settledResults.map((settled, index) => {
    if (settled.status === "fulfilled") {
      return settled.value;
    }

    const indicator = indicators[index];
    return {
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
        settled.reason instanceof Error
          ? settled.reason.message
          : "Unexpected validation failure.",
    };
  });

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
 *  - "pdf": All 18 PDF source indicators from Excel & template
 *  - "excel" / "api": All 112 structured API indicators from the Excel registry
 *  - "all": Full unified set of 130 indicators (112 Excel APIs + 18 PDF sources)
 */
function loadFallbackIndicators(mode: "pdf" | "excel" | "all" = "all"): {
  indicators: Indicator[];
  country: string;
  countryCode: string;
} {
  try {
    let indicators: Indicator[] = [];
    if (mode === "pdf") {
      indicators = loadPdfIndicators();
    } else if (mode === "excel") {
      indicators = loadExcelApiIndicators();
    } else {
      indicators = loadAllIndicators();
    }

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
      excel_only?: boolean;
      from_template?: boolean;
      all?: boolean;
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
      let mode: "pdf" | "excel" | "all" = "all";
      if (body.pdf_only === true || body.from_template === true) {
        mode = "pdf";
      } else if (body.excel_only === true) {
        mode = "excel";
      }

      const fallback = loadFallbackIndicators(mode);
      indicators = fallback.indicators;
      country = fallback.country;
      countryCode = fallback.countryCode;
    }

    if (indicators.length === 0) {
      return NextResponse.json(
        {
          message:
            "Invalid request: `indicators` array is required or could not be loaded from template.",
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
//   - ?excel_only=true  -> Validates the 112 Excel API source indicators
//   - ?all=true         -> Validates all 130 indicators (112 Excel APIs + 18 PDFs)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isPdfOnly = searchParams.get("pdf_only") === "true";
    const isExcelOnly =
      searchParams.get("excel_only") === "true" ||
      searchParams.get("api_only") === "true";

    let mode: "pdf" | "excel" | "all" = "all";
    if (isPdfOnly) {
      mode = "pdf";
    } else if (isExcelOnly) {
      mode = "excel";
    }

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