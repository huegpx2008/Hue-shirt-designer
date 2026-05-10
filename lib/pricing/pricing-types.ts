/**
 * Shared pricing domain types for apparel printing methods.
 *
 * These are intentionally UI-agnostic so both server and client code can reuse
 * the same calculator helpers.
 */

export type PrintMethod = "dtf" | "screen_print";

export type QuantityTier = 24 | 50 | 100 | 150 | 200 | 250 | 300;

export interface DtfPieceSpec {
  /** Width of one transfer in inches. */
  width: number;
  /** Height of one transfer in inches. */
  height: number;
  /** Number of identical transfers for this piece spec. */
  quantity: number;
}

export interface DtfPricingInput {
  pieces: DtfPieceSpec[];
  /** Roll width in inches (commonly 22"). */
  rollWidthInches?: number;
  /** Padding between pieces in inches. */
  paddingInches?: number;
  /** Material cost charged per linear inch of roll used. */
  materialCostPerLinearInch?: number;
  /** Minimum material charge before shipping. */
  minimumMaterialCharge?: number;
  /** Flat shipping/additional handling fee. */
  shippingFlat?: number;
}

export interface DtfPricingResult {
  totalTransfers: number;
  linearInchesUsed: number;
  materialCost: number;
  shipping: number;
  totalCost: number;
}

export interface ScreenPrintLocation {
  name: string;
  colors: 1 | 2 | 3 | 4;
}

export interface ScreenPrintPricingInput {
  quantity: number;
  locations: ScreenPrintLocation[];
  setupFeeEnabled?: boolean;
}

export interface ScreenPrintLocationCharge {
  name: string;
  colors: 1 | 2 | 3 | 4;
  pricingType: "first_side" | "additional_side";
  pricePerShirt: number;
  subtotal: number;
}

export interface ScreenPrintPricingResult {
  quantityTier: QuantityTier;
  quantity: number;
  perShirtPrintCharge: number;
  printSubtotal: number;
  setupFee: number;
  totalPrintCharge: number;
  locationCharges: ScreenPrintLocationCharge[];
}

export interface PrintMethodRecommendation {
  recommendedMethod: PrintMethod;
  rationale: string;
}
