import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { parseExcelSources } from "@/helper/excel-parser";
import { processValidation } from "@/helper/validation-processor";
import { getCountryConfig } from "@/helper/country-config";

interface ValidateSheetPayload {
  filePath?: string;
  sheetName?: string;
  countryCode?: string;
  country?: string;
  province?: string;
}

export async function POST(request: NextRequest) {
  try {
    let body: ValidateSheetPayload = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const {
      filePath = "helper/RXBE_Wizard_Step1_Sources_Keys.xlsx",
      sheetName,
      countryCode: reqCountryCode,
      country: reqCountry,
      province: reqProvince,
    } = body;

    // Resolve and validate filePath to prevent path traversal
    const resolvedPath = path.resolve(process.cwd(), filePath);
    const allowedUploads = path.resolve(process.cwd(), "uploads");
    const allowedHelper = path.resolve(process.cwd(), "helper");

    const isInsideUploads = resolvedPath.startsWith(allowedUploads);
    const isInsideHelper = resolvedPath.startsWith(allowedHelper);

    if (!isInsideUploads && !isInsideHelper) {
      return NextResponse.json(
        { error: "Access denied. Target file must be inside uploads/ or helper/." },
        { status: 403 }
      );
    }

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        { error: `File not found at: ${filePath}` },
        { status: 404 }
      );
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext !== ".xlsx" && ext !== ".xls") {
      return NextResponse.json(
        { error: "Target file is not a supported Excel workbook (.xlsx, .xls)." },
        { status: 400 }
      );
    }

    // Try reading companion metadata if country/province not explicitly supplied
    let metaCountry: string | undefined;
    let metaCountryCode: string | undefined;
    let metaProvince: string | undefined;

    const metaPath = `${resolvedPath}.meta.json`;
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        metaCountry = meta.country;
        metaCountryCode = meta.countryCode;
        metaProvince = meta.province;
      } catch {
        // ignore JSON parse error
      }
    } else if (isInsideUploads) {
      // Infer from directory: uploads/<country>/<state>/...
      const relFromUploads = path.relative(allowedUploads, resolvedPath);
      const segments = relFromUploads.split(path.sep);
      if (segments.length >= 3) {
        metaCountry = segments[0].replace(/_/g, " ");
        metaProvince = segments[1].replace(/_/g, " ");
      }
    }

    const resolvedCountryCodeOrName =
      reqCountryCode || reqCountry || metaCountryCode || metaCountry || "PG";
    const countryCfg = getCountryConfig(resolvedCountryCodeOrName);

    const resolvedProvince =
      reqProvince || metaProvince || countryCfg.default_province;

    const indicators = parseExcelSources({
      excelPath: resolvedPath,
      sheetName: sheetName || undefined,
      countryCode: countryCfg.country_code,
      province: resolvedProvince,
    });

    if (!indicators || indicators.length === 0) {
      return NextResponse.json(
        {
          error: `No extractable indicators found in sheet "${sheetName || "Default"}" of ${path.basename(filePath)}.`,
          sheetName,
          fileName: path.basename(filePath),
          country: countryCfg.country,
          province: resolvedProvince,
        },
        { status: 404 }
      );
    }

    const response = await processValidation(
      indicators,
      countryCfg.country,
      countryCfg.country_code,
      sheetName || "Sheet"
    );

    // Attach province to the validation response for UI presentation
    const responseWithProvince = {
      ...response,
      province: resolvedProvince,
    };

    return NextResponse.json(responseWithProvince, { status: 200 });
  } catch (error: unknown) {
    console.error("POST /api/validate-sheet error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to validate selected sheet.",
      },
      { status: 500 }
    );
  }
}
