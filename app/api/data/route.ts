import { NextRequest, NextResponse } from "next/server";
import type {
  ValidationRequest,
  ValidationResponse,
  IndicatorResult,
} from "@/helper/types";
import { validateIndicator } from "@/helper/indicator-validator";

export async function POST(request: NextRequest) {
  try {
    // ── Parse & validate request body ─────────────────────────────────
    const body = (await request.json()) as Partial<ValidationRequest>;

    if (
      !body.indicators ||
      !Array.isArray(body.indicators) ||
      body.indicators.length === 0
    ) {
      return NextResponse.json(
        {
          message:
            "Invalid request: `indicators` array is required and must not be empty.",
        },
        { status: 400 }
      );
    }

    // ── Validate all indicators in parallel ───────────────────────────
    const settledResults = await Promise.allSettled(
      body.indicators.map((indicator) => validateIndicator(indicator))
    );

    // Unwrap Promise.allSettled results
    const results: IndicatorResult[] = settledResults.map((settled, index) => {
      if (settled.status === "fulfilled") {
        return settled.value;
      }

      // A rejected promise — should be rare since validateIndicator catches
      // its own errors, but we handle it defensively.
      const indicator = body.indicators![index];
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

    // ── Build summary ─────────────────────────────────────────────────
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

    // overall_status is true only when every fetchable indicator matched
    const overall_status = mismatched === 0 && errors === 0;

    const now = new Date();
    const testRunId = `RUN-${now.toISOString().slice(0, 10)}-${String(now.getTime()).slice(-4)}`;

    const response: ValidationResponse = {
      test_run_id: testRunId,
      executed_at: now.toISOString(),
      country: body.project_metadata?.country ?? "Unknown",
      country_code: body.project_metadata?.country_code ?? "XX",
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

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("POST /api/data error:", error);
    return NextResponse.json(
      {
        message: "Something went wrong.",
      },
      { status: 500 }
    );
  }
}