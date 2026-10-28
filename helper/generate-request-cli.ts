#!/usr/bin/env bun
import path from "path";
import { generateValidationRequest } from "./request-generator";

function parseArgs(args: string[]) {
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--country" || arg === "-c") {
      result.country = args[++i];
    } else if (arg === "--province" || arg === "-p") {
      result.province = args[++i];
    } else if (arg === "--excel" || arg === "-e") {
      result.excel = args[++i];
    } else if (arg === "--html") {
      result.html = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      result.output = args[++i];
    } else if (arg === "--internal") {
      result.internal = true;
    } else if (arg === "--print") {
      result.print = true;
    }
  }
  return result;
}

function showHelp() {
  console.log(`
Usage: bun run generate-request [options]

Options:
  -c, --country <code>    Country code or ISO3 (e.g., PG, FJ, VU, TON) [default: PG]
  -p, --province <name>   Province name (e.g., "National Capital District")
  -e, --excel <path>      Path to Excel sources file [default: helper/RXBE_Wizard_Step1_Sources_Keys.xlsx]
  --html <path>           Path to HTML template with LIVE_SNAP [default: helper/RXBE_live_Template.html]
  -o, --output <path>     Output JSON filepath [default: helper/generated_request.json]
  --internal              Include internal non-source indicators
  --print                 Print generated JSON to stdout
  -h, --help              Show this help message

Examples:
  bun run generate-request
  bun run generate-request --country PG --province "National Capital District" --output my_request.json
  bun run generate-request -c FJ -o fj_request.json
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const countryCode = (args.country as string) || "PG";
  const province = args.province as string | undefined;
  const excelPath = args.excel as string | undefined;
  const htmlPath = args.html as string | undefined;
  const includeInternal = Boolean(args.internal);
  const outputPath =
    (args.output as string) ||
    (args.print ? undefined : path.resolve(process.cwd(), "helper/generated_request.json"));

  console.log(`Generating validation request for country: ${countryCode}...`);
  if (province) console.log(`  Province: ${province}`);
  if (excelPath) console.log(`  Excel source: ${excelPath}`);

  const req = generateValidationRequest({
    countryCode,
    province,
    excelPath,
    htmlPath,
    includeInternal,
    outputPath,
  });

  console.log(`\nGenerated request successfully!`);
  console.log(`  Request ID: ${req.request_id}`);
  console.log(`  Country:    ${req.project_metadata.country} (${req.project_metadata.country_code})`);
  console.log(`  Province:   ${req.project_metadata.province}`);
  console.log(`  Indicators: ${req.indicators.length} total`);
  if (outputPath) {
    console.log(`  Saved to:   ${outputPath}`);
  }

  if (args.print) {
    console.log("\n" + JSON.stringify(req, null, 2));
  }
}

main().catch((err) => {
  console.error("Error generating validation request:", err);
  process.exit(1);
});



// For New Excel Sheet
// bun run generate-request -- --excel helper/RXBE_Wizard_Step1_Fiji.xlsx --country FJ --output helper/fiji_request.json