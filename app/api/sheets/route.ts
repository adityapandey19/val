import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { inspectWorkbookSheets } from "@/helper/excel-parser";
import { getCountryConfig, getAvailableCountryOptions } from "@/helper/country-config";
import type { SheetMetadata, WorkbookInfo } from "@/helper/types";

export type { SheetMetadata, WorkbookInfo };

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const DEFAULT_EXCEL = path.resolve(process.cwd(), "helper/RXBE_Wizard_Step1_Sources_Keys.xlsx");

interface FileMetadata {
  country?: string;
  countryCode?: string;
  province?: string;
  displayName?: string;
  fileName?: string;
  uploadedAt?: string;
}

/**
 * Recursively find all Excel files (.xlsx, .xls) within a directory.
 */
function findExcelFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const dirent of list) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      results = results.concat(findExcelFiles(fullPath));
    } else if (dirent.isFile()) {
      const ext = path.extname(dirent.name).toLowerCase();
      if ((ext === ".xlsx" || ext === ".xls") && !dirent.name.endsWith(".meta.json")) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

export async function GET() {
  try {
    const workbooks: WorkbookInfo[] = [];

    // 1. Default baseline workbook (Papua New Guinea / National Capital District)
    if (fs.existsSync(DEFAULT_EXCEL)) {
      const stats = fs.statSync(DEFAULT_EXCEL);
      const sheets = inspectWorkbookSheets(DEFAULT_EXCEL);
      workbooks.push({
        fileName: path.basename(DEFAULT_EXCEL),
        displayName: "RXBE Wizard Step 1 (Default)",
        filePath: path.relative(process.cwd(), DEFAULT_EXCEL),
        isDefault: true,
        country: "Papua New Guinea",
        countryCode: "PG",
        province: "National Capital District",
        uploadedAt: stats.mtime.toISOString(),
        sheets,
      });
    }

    // 2. Scan uploads directory recursively (uploads/<country>/<state>/<file>)
    if (fs.existsSync(UPLOAD_DIR)) {
      const excelFiles = findExcelFiles(UPLOAD_DIR);

      for (const fullPath of excelFiles) {
        const stats = fs.statSync(fullPath);
        const sheets = inspectWorkbookSheets(fullPath);

        // Try reading companion .meta.json
        const metaPath = `${fullPath}.meta.json`;
        let meta: FileMetadata | null = null;
        if (fs.existsSync(metaPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          } catch {
            meta = null;
          }
        }

        // Infer country and province from relative path if not in meta
        const relFromUploads = path.relative(UPLOAD_DIR, fullPath);
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
    console.error("GET /api/sheets error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load sheets." },
      { status: 500 }
    );
  }
}
