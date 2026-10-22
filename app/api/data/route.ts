import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import type {
  ValidationRequest,
  ValidationResponse,
  IndicatorResult,
  Indicator,
} from "@/helper/types";
import { validateIndicator } from "@/helper/indicator-validator";
import { buildPdfIndicators } from "@/helper/validate-pdf-sources";

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
 * Loads default fallback indicators:
 *  - If `pdfOnly` is true: loads all 18 PDF source indicators from Excel & template
 *  - Otherwise: loads the benchmark payload from request_json_example.json
 */
function loadFallbackIndicators(pdfOnly = false): {
  indicators: Indicator[];
  country: string;
  countryCode: string;
} {
  const htmlPath = path.resolve(process.cwd(), "helper/RXBE_live_Template.html");
  if (pdfOnly && fs.existsSync(htmlPath)) {
    return {
      indicators: buildPdfIndicators(htmlPath),
      country: "Papua New Guinea",
      countryCode: "PG",
    };
  }

  const reqJsonPath = path.resolve(process.cwd(), "helper/request_json_example.json");
  if (fs.existsSync(reqJsonPath)) {
    const raw = fs.readFileSync(reqJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as ValidationRequest;
    return {
      indicators: parsed.indicators ?? [],
      country: parsed.project_metadata?.country ?? "Papua New Guinea",
      countryCode: parsed.project_metadata?.country_code ?? "PG",
    };
  }

  if (fs.existsSync(htmlPath)) {
    return {
      indicators: buildPdfIndicators(htmlPath),
      country: "Papua New Guinea",
      countryCode: "PG",
    };
  }

  return { indicators: [], country: "Unknown", countryCode: "XX" };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/data
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    let body: (Partial<ValidationRequest> & { pdf_only?: boolean; from_template?: boolean }) = {};
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
      // Automatic fallback if no indicators array was provided
      const isPdfOnly = body.pdf_only === true || body.from_template === true;
      const fallback = loadFallbackIndicators(isPdfOnly);
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
//   - ?pdf_only=true   -> Validates the 18 PDF source indicators from Excel/Template
//   - ?all=true        -> Validates all 45 indicators from request_json_example.json
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pdfOnly = searchParams.get("pdf_only") !== "false" && searchParams.get("all") !== "true";
    const fallback = loadFallbackIndicators(pdfOnly);

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