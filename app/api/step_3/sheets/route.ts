import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { inspectWorkbookSheets, findExcelFiles } from "@/lib/excel-utils";
import { getCountryConfig, getAvailableCountryOptions } from "@/lib/country-config";
import type { WorkbookInfo } from "@/lib/types";

const STEP3_UPLOAD_DIR = path.resolve(process.cwd(), "app/step_3/upload");
const DEFAULT_EXCEL = path.resolve(process.cwd(), "app/step_3/lib/RXBE_Wizard_Step3_Sources_UI_Only.xlsx");

interface FileMetadata {
  country?: string;
  countryCode?: string;
  province?: string;
  displayName?: string;
  fileName?: string;
  uploadedAt?: string;
}

export async function GET() {
  try {
    const workbooks: WorkbookInfo[] = [];

    // 1. Default baseline workbook
    const baselinePath = DEFAULT_EXCEL;
    if (fs.existsSync(baselinePath)) {
      const stats = fs.statSync(baselinePath);
      const sheets = inspectWorkbookSheets(baselinePath);
      workbooks.push({
        fileName: path.basename(baselinePath),
        displayName: "Step 3 Default (Resource & Risk Index)",
        filePath: path.relative(process.cwd(), baselinePath),
        isDefault: true,
        country: "Papua New Guinea",
        countryCode: "PG",
        province: "National Capital District",
        uploadedAt: stats.mtime.toISOString(),
        sheets,
      });
    }

    // 2. Scan Step 3 uploads directory (app/step_3/upload/<country>/<state>/<file>)
    if (fs.existsSync(STEP3_UPLOAD_DIR)) {
      const excelFiles = findExcelFiles(STEP3_UPLOAD_DIR);

      for (const fullPath of excelFiles) {
        const stats = fs.statSync(fullPath);
        const sheets = inspectWorkbookSheets(fullPath);

        const metaPath = `${fullPath}.meta.json`;
        let meta: FileMetadata | null = null;
        if (fs.existsSync(metaPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          } catch {
            meta = null;
          }
        }

        const relFromUploads = path.relative(STEP3_UPLOAD_DIR, fullPath);
        const segments = relFromUploads.split(path.sep);

        let inferredCountry = "Papua New Guinea";
        let inferredProvince = "National Capital District";

        if (segments.length >= 3) {
          inferredCountry = segments[0].replace(/_/g, " ");
          inferredProvince = segments[1].replace(/_/g, " ");
        } else if (segments.length === 2) {
          inferredCountry = segments[0].replace(/_/g, " ");
        }

        const country = meta?.country || inferredCountry;
        const countryCfg = getCountryConfig(meta?.countryCode || country);
        const countryCode = meta?.countryCode || countryCfg.country_code;
        const province = meta?.province || inferredProvince || countryCfg.default_province;

        const baseFileName = path.basename(fullPath);
        const displayClean =
          meta?.displayName || baseFileName.replace(/_\d+(\.[a-zA-Z0-9]+)$/, "$1");

        workbooks.push({
          fileName: baseFileName,
          displayName: displayClean,
          filePath: path.relative(process.cwd(), fullPath),
          isDefault: false,
          country,
          countryCode,
          province,
          uploadedAt: meta?.uploadedAt || stats.mtime.toISOString(),
          sheets,
        });
      }
    }

    const availableCountries = getAvailableCountryOptions();

    return NextResponse.json({ workbooks, availableCountries }, { status: 200 });
  } catch (error: unknown) {
    console.error("GET /api/step_3/sheets error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Step 3 sheets." },
      { status: 500 }
    );
  }
}
