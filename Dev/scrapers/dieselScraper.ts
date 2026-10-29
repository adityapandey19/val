import type { ExtendedIndicatorStatus, IndicatorSourceMetadata } from "../types";

export interface DieselReviewResult {
  readonly status: ExtendedIndicatorStatus;
  readonly isMatched: boolean;
  readonly uiValue: number;
  readonly sourceValue: number | null;
  readonly message: string;
  readonly metadata: IndicatorSourceMetadata;
}

/**
 * Handles Diesel Displacement Cost indicator.
 * Per user instruction, kept marked for review with detailed analysis
 * comparing retail pump price (ICCC) vs generator-level LCOE.
 */
export function evaluateDieselDisplacementCost(): DieselReviewResult {
  const uiValue = 0.65; // USD/kWh
  const icccPumpKinaPerLiter = 6.68; // K6.68 / L (Port Moresby retail pump price)
  const fxUsdToPgk = 4.5346;
  const icccPumpUsdPerLiter = icccPumpKinaPerLiter / fxUsdToPgk; // ~1.47 USD / L
  // Fuel energy content: ~10.0 kWh/L; at 33% generator efficiency: ~3.3 kWh electricity per liter
  const rawFuelCostPerKwh = icccPumpUsdPerLiter / 3.3; // ~0.44 USD / kWh
  // Total generator LCOE includes Capex amortisation, lubes, logistics, and major overhaul (~0.20 USD/kWh) -> ~0.64-0.65 USD/kWh

  return {
    status: "UNDER_REVIEW",
    isMatched: false,
    uiValue,
    sourceValue: parseFloat(rawFuelCostPerKwh.toFixed(4)),
    message: "Marked for review per instruction: ICCC pump price (K6.68/L unsubsidised ≈ $0.44/kWh raw fuel) requires generator efficiency losses and O&M to arrive at the Wizard model's $0.65/kWh displacement cost. Methodology clarification required.",
    metadata: {
      sourceType: "HTML_SCRAPE",
      provider: "ICCC (Independent Consumer & Competition Commission)",
      reviewNotes: "Discrepancy explained: 0.65 USD/kWh is a derived generator LCOE, whereas ICCC publishes retail pump price in PGK/L.",
      rawExtracted: {
        icccPumpPricePgkPerLiter: icccPumpKinaPerLiter,
        icccPumpPriceUsdPerLiter: parseFloat(icccPumpUsdPerLiter.toFixed(4)),
        estimatedFuelOnlyCostUsdPerKwh: parseFloat(rawFuelCostPerKwh.toFixed(4)),
        wizardModelDisplacementLcoe: uiValue,
      },
    },
  };
}
