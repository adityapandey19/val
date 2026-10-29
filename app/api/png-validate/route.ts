import { NextRequest, NextResponse } from "next/server";
import { validatePNGDataset } from "@/Dev/validator/pngValidator";
import type { PNGIndicator } from "@/Dev/types";
import { defaultPNGDataset } from "@/Dev/defaultDataset";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode")?.toUpperCase() === "FIXTURE" ? "FIXTURE_OFFLINE" : "LIVE";
    const filterScrapersOnly = searchParams.get("scrapers_only") === "true";

    let targetIndicators: PNGIndicator[] = defaultPNGDataset.indicators;
    if (filterScrapersOnly) {
      targetIndicators = targetIndicators.filter((i) => i.is_scrape_target);
    }

    const response = await validatePNGDataset(targetIndicators, mode);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("GET /api/png-validate error:", error);
    return NextResponse.json(
      { message: (error as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      indicators?: PNGIndicator[];
      mode?: "LIVE" | "FIXTURE_OFFLINE";
      scrapers_only?: boolean;
    };

    let targetIndicators: PNGIndicator[];
    if (body.indicators && body.indicators.length > 0) {
      targetIndicators = body.indicators;
    } else if (body.scrapers_only) {
      targetIndicators = defaultPNGDataset.indicators.filter((i) => i.is_scrape_target);
    } else {
      targetIndicators = defaultPNGDataset.indicators;
    }

    const mode = body.mode === "FIXTURE_OFFLINE" ? "FIXTURE_OFFLINE" : "LIVE";
    const response = await validatePNGDataset(targetIndicators, mode);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("POST /api/png-validate error:", error);
    return NextResponse.json(
      { message: (error as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
