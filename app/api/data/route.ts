import { NextRequest, NextResponse } from "next/server";
import type { ValidationRequest, Indicator } from "@/helper/types";
import {
  loadPdfIndicators,
  loadWizardStep1Indicators,
} from "@/helper/excel-source-loader";
import { processValidation } from "@/helper/validation-processor";

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