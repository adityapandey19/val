import { NextRequest, NextResponse } from "next/server";
import { generateValidationRequest } from "@/helper/request-generator";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const countryCode =
      searchParams.get("country") ||
      searchParams.get("country_code") ||
      searchParams.get("iso3") ||
      "PG";
    const province = searchParams.get("province") || undefined;
    const includeInternal = searchParams.get("include_internal") === "true";

    const validationRequest = generateValidationRequest({
      countryCode,
      province,
      includeInternal,
    });

    return NextResponse.json(validationRequest, { status: 200 });
  } catch (error) {
    console.error("GET /api/generate-request error:", error);
    return NextResponse.json(
      {
        message: "Failed to generate validation request JSON.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: {
      country?: string;
      country_code?: string;
      iso3?: string;
      province?: string;
      include_internal?: boolean;
    } = {};

    try {
      body = (await request.json()) ?? {};
    } catch {
      // Empty body is acceptable
    }

    const countryCode =
      body.country_code || body.country || body.iso3 || "PG";
    const province = body.province;
    const includeInternal = Boolean(body.include_internal);

    const validationRequest = generateValidationRequest({
      countryCode,
      province,
      includeInternal,
    });

    return NextResponse.json(validationRequest, { status: 200 });
  } catch (error) {
    console.error("POST /api/generate-request error:", error);
    return NextResponse.json(
      {
        message: "Failed to generate validation request JSON.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
