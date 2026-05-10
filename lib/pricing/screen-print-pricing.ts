import type {
  QuantityTier,
  ScreenPrintLocation,
  ScreenPrintLocationCharge,
  ScreenPrintPricingInput,
  ScreenPrintPricingResult,
} from "./pricing-types";

const QTY_TIERS: QuantityTier[] = [24, 50, 100, 150, 200, 250, 300];

const SINGLE_SIDE: Record<QuantityTier, Record<1 | 2 | 3 | 4, number>> = {
  24: { 1: 6.5, 2: 7, 3: 7.5, 4: 8 },
  50: { 1: 5.85, 2: 6.3, 3: 6.75, 4: 7.2 },
  100: { 1: 5.53, 2: 5.95, 3: 6.38, 4: 6.8 },
  150: { 1: 5.2, 2: 5.6, 3: 6, 4: 6.4 },
  200: { 1: 4.88, 2: 5.25, 3: 5.63, 4: 6 },
  250: { 1: 4.55, 2: 4.9, 3: 5.25, 4: 5.6 },
  300: { 1: 4.23, 2: 4.55, 3: 4.88, 4: 5.2 },
};

const ADDITIONAL_SIDE: Record<QuantityTier, Record<1 | 2 | 3 | 4, number>> = {
  24: { 1: 2, 2: 2.5, 3: 3, 4: 3.5 },
  50: { 1: 1.8, 2: 2.25, 3: 2.7, 4: 3.15 },
  100: { 1: 1.7, 2: 2.13, 3: 2.55, 4: 2.98 },
  150: { 1: 1.6, 2: 2, 3: 2.4, 4: 2.8 },
  200: { 1: 1.5, 2: 1.88, 3: 2.25, 4: 2.63 },
  250: { 1: 1.4, 2: 1.75, 3: 2.1, 4: 2.45 },
  300: { 1: 1.3, 2: 1.63, 3: 1.95, 4: 2.28 },
};

const SETUP_FEE = 25;

export function resolveScreenPrintTier(quantity: number): QuantityTier {
  return QTY_TIERS.reduce<QuantityTier>((best, tier) => (quantity >= tier ? tier : best), QTY_TIERS[0]);
}

function resolveLocationCharge(
  quantityTier: QuantityTier,
  location: ScreenPrintLocation,
  isFirstSide: boolean,
  quantity: number,
): ScreenPrintLocationCharge {
  const matrix = isFirstSide ? SINGLE_SIDE : ADDITIONAL_SIDE;
  const pricePerShirt = matrix[quantityTier][location.colors] ?? 0;

  return {
    name: location.name,
    colors: location.colors,
    pricingType: isFirstSide ? "first_side" : "additional_side",
    pricePerShirt,
    subtotal: pricePerShirt * quantity,
  };
}

export function calculateScreenPrintPricing(input: ScreenPrintPricingInput): ScreenPrintPricingResult {
  const quantity = Math.max(0, Math.floor(input.quantity));
  const quantityTier = resolveScreenPrintTier(quantity);
  const locationCharges = input.locations.map((location, index) =>
    resolveLocationCharge(quantityTier, location, index === 0, quantity),
  );

  const perShirtPrintCharge = locationCharges.reduce((sum, location) => sum + location.pricePerShirt, 0);
  const printSubtotal = locationCharges.reduce((sum, location) => sum + location.subtotal, 0);
  const setupFee = input.setupFeeEnabled ? SETUP_FEE : 0;

  return {
    quantityTier,
    quantity,
    perShirtPrintCharge,
    printSubtotal,
    setupFee,
    totalPrintCharge: printSubtotal + setupFee,
    locationCharges,
  };
}

export function screenPrintPricingExample(): ScreenPrintPricingResult {
  return calculateScreenPrintPricing({
    quantity: 72,
    setupFeeEnabled: true,
    locations: [
      { name: "Front", colors: 2 },
      { name: "Back", colors: 1 },
    ],
  });
}
