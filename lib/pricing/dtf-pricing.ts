import type { DtfPieceSpec, DtfPricingInput, DtfPricingResult } from "./pricing-types";

const DEFAULT_ROLL_WIDTH_INCHES = 22;
const DEFAULT_PADDING_INCHES = 0.25;
const DEFAULT_MATERIAL_COST_PER_LINEAR_INCH = 0.5;
const DEFAULT_MINIMUM_MATERIAL_CHARGE = 10;
const DEFAULT_SHIPPING_FLAT = 10;

interface PlacementPiece {
  width: number;
  height: number;
}

/**
 * Flattens piece specs into individual placements for roll layout estimation.
 */
function expandPieces(pieces: DtfPieceSpec[]): PlacementPiece[] {
  return pieces.flatMap((piece) => {
    const width = Math.max(0, piece.width);
    const height = Math.max(0, piece.height);
    const quantity = Math.max(0, Math.floor(piece.quantity));

    return Array.from({ length: quantity }, () => ({ width, height }));
  });
}

/**
 * Estimates roll length used by a simple row-packing strategy inspired by the
 * reference pricing app. This keeps the helper deterministic and fast.
 */
export function estimateDtfLinearInches(
  pieces: DtfPieceSpec[],
  rollWidthInches = DEFAULT_ROLL_WIDTH_INCHES,
  paddingInches = DEFAULT_PADDING_INCHES,
): number {
  const placements = expandPieces(pieces)
    .filter((piece) => piece.width > 0 && piece.height > 0 && piece.width <= rollWidthInches)
    .sort((a, b) => b.height - a.height || b.width - a.width);

  const rows: Array<{ usedWidth: number; height: number }> = [];

  for (const piece of placements) {
    const footprintWidth = piece.width + paddingInches;
    const footprintHeight = piece.height + paddingInches;
    let placed = false;

    for (const row of rows) {
      if (row.usedWidth + footprintWidth <= rollWidthInches + 1e-4) {
        row.usedWidth += footprintWidth;
        row.height = Math.max(row.height, footprintHeight);
        placed = true;
        break;
      }
    }

    if (!placed) {
      rows.push({ usedWidth: footprintWidth, height: footprintHeight });
    }
  }

  return rows.reduce((sum, row) => sum + row.height, 0);
}

/**
 * Calculates baseline DTF transfer pricing components.
 */
export function calculateDtfPricing(input: DtfPricingInput): DtfPricingResult {
  const rollWidth = input.rollWidthInches ?? DEFAULT_ROLL_WIDTH_INCHES;
  const padding = input.paddingInches ?? DEFAULT_PADDING_INCHES;
  const materialRate = input.materialCostPerLinearInch ?? DEFAULT_MATERIAL_COST_PER_LINEAR_INCH;
  const minimumMaterial = input.minimumMaterialCharge ?? DEFAULT_MINIMUM_MATERIAL_CHARGE;
  const shipping = input.shippingFlat ?? DEFAULT_SHIPPING_FLAT;

  const totalTransfers = input.pieces.reduce((sum, piece) => sum + Math.max(0, Math.floor(piece.quantity)), 0);
  const linearInchesUsed = estimateDtfLinearInches(input.pieces, rollWidth, padding);
  const materialCost = Math.max(minimumMaterial, linearInchesUsed * materialRate);
  const totalCost = materialCost + shipping;

  return {
    totalTransfers,
    linearInchesUsed,
    materialCost,
    shipping,
    totalCost,
  };
}

/**
 * Small sample calculation for tests/docs.
 */
export function dtfPricingExample(): DtfPricingResult {
  return calculateDtfPricing({
    pieces: [
      { width: 11, height: 10, quantity: 24 },
      { width: 3.5, height: 3.5, quantity: 24 },
    ],
  });
}
