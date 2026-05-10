import { calculateDtfPricing } from "./dtf-pricing";
import { calculateScreenPrintPricing } from "./screen-print-pricing";
import type {
  DtfPricingInput,
  PrintMethodRecommendation,
  ScreenPrintPricingInput,
} from "./pricing-types";

/**
 * Compares baseline DTF transfer cost vs. screen print charge and recommends a
 * print method using purely pricing-oriented heuristics.
 */
export function recommendPrintMethodByCost(
  dtfInput: DtfPricingInput,
  screenPrintInput: ScreenPrintPricingInput,
): PrintMethodRecommendation {
  const dtf = calculateDtfPricing(dtfInput);
  const screen = calculateScreenPrintPricing(screenPrintInput);

  if (dtf.totalCost <= screen.totalPrintCharge) {
    return {
      recommendedMethod: "dtf",
      rationale: `DTF estimated total ($${dtf.totalCost.toFixed(2)}) is <= screen print estimated charge ($${screen.totalPrintCharge.toFixed(2)}).`,
    };
  }

  return {
    recommendedMethod: "screen_print",
    rationale: `Screen print estimated charge ($${screen.totalPrintCharge.toFixed(2)}) is lower than DTF estimated total ($${dtf.totalCost.toFixed(2)}).`,
  };
}

/**
 * Rule-of-thumb recommendation independent of garment cost data.
 */
export function recommendPrintMethodByQuantity(quantity: number): PrintMethodRecommendation {
  if (quantity < 48) {
    return {
      recommendedMethod: "dtf",
      rationale: "Short runs are usually better suited for DTF due to minimal setup overhead.",
    };
  }

  return {
    recommendedMethod: "screen_print",
    rationale: "Larger runs usually benefit from lower per-shirt screen printing rates.",
  };
}
