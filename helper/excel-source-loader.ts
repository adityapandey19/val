import path from "path";
import type { Indicator } from "./types";
import { buildPdfIndicators } from "./validate-pdf-sources";
import { parseExcelSources } from "./excel-parser";

const HTML_PATH = path.resolve(process.cwd(), "helper/RXBE_live_Template.html");

/**
 * Loads the 18 PDF indicators extracted from RXBE PDF sources:
 * World Bank IDA21, JICA, Business Ready, IPA Energy Guide, Land Act, FAO, IRENA.
 */
export function loadPdfIndicators(): Indicator[] {
  return buildPdfIndicators(HTML_PATH);
}

/**
 * Loads the Wizard Step 1 indicators from RXBE_Wizard_Step1_Sources_Keys.xlsx
 * mapped with LIVE_SNAP values.
 */
export function loadWizardStep1Indicators(options?: {
  countryCode?: string;
  province?: string;
  includeInternal?: boolean;
}): Indicator[] {
  return parseExcelSources(options);
}
