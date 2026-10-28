import fs from "fs";
import path from "path";
import type { ValidationRequest, ProjectMetadata } from "./types";
import { parseExcelSources } from "./excel-parser";
import { getCountryConfig } from "./country-config";
import { loadLiveSnap, getProvinceResource } from "./livesnap-resolver";

export interface RequestGeneratorOptions {
  countryCode?: string;
  province?: string;
  excelPath?: string;
  htmlPath?: string;
  includeInternal?: boolean;
  requestId?: string;
  outputPath?: string;
}

/**
 * Generates a full ValidationRequest JSON from the Excel source sheet and HTML LIVE_SNAP.
 */
export function generateValidationRequest(
  options?: RequestGeneratorOptions
): ValidationRequest {
  const countryCode = options?.countryCode || "PG";
  const countryCfg = getCountryConfig(countryCode);
  const province = options?.province || countryCfg.default_province;
  const excelPath =
    options?.excelPath ||
    path.resolve(process.cwd(), "helper/RXBE_Wizard_Step1_Sources_Keys.xlsx");
  const htmlPath =
    options?.htmlPath || path.resolve(process.cwd(), "helper/RXBE_live_Template.html");
  const includeInternal = options?.includeInternal ?? false;

  const liveSnap = loadLiveSnap(htmlPath);

  // Determine coordinates for project_metadata
  const snapLat = getProvinceResource(liveSnap, countryCfg.iso3, province, "lat");
  const snapLon = getProvinceResource(liveSnap, countryCfg.iso3, province, "lon");
  const latitude =
    typeof snapLat === "number" ? snapLat : countryCfg.coordinates.latitude;
  const longitude =
    typeof snapLon === "number" ? snapLon : countryCfg.coordinates.longitude;

  const projectMetadata: ProjectMetadata = {
    country: countryCfg.country,
    country_code: countryCfg.country_code,
    iso3: countryCfg.iso3,
    province,
    coordinates: {
      latitude: Number(Number(latitude).toFixed(6)),
      longitude: Number(Number(longitude).toFixed(6)),
    },
    grid_connection_type: countryCfg.grid_connection_type,
    distance_to_grid_km: countryCfg.distance_to_grid_km,
  };

  const indicators = parseExcelSources({
    excelPath,
    htmlPath,
    countryCode,
    province,
    includeInternal,
  });

  const now = new Date();
  const dateSlug = now.toISOString().slice(0, 10).replace(/-/g, "");
  const provSlug = province.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const requestId =
    options?.requestId ||
    `REQ-VERIFY-${countryCfg.iso3}-${provSlug}-${dateSlug}`;

  const validationRequest: ValidationRequest = {
    request_id: requestId,
    timestamp: now.toISOString(),
    project_metadata: projectMetadata,
    indicators,
  };

  if (options?.outputPath) {
    const outPath = path.resolve(process.cwd(), options.outputPath);
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outPath, JSON.stringify(validationRequest, null, 2), "utf-8");
  }

  return validationRequest;
}
