export const money = (n) =>
  Number(n || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

export const num = (v, fallback = 0) => {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function getFoamcoreSheetPrice(sheetCount, doubleSided, foamcoreSheetPricing) {
  const tiers = doubleSided ? foamcoreSheetPricing.double : foamcoreSheetPricing.single;
  return tiers.find((tier) => sheetCount <= tier.max)?.price || tiers[tiers.length - 1].price;
}

export function getPvcSheetPrice(sheetCount, pvcType, pvcSheetPricing) {
  const tiers = pvcSheetPricing[pvcType] || pvcSheetPricing["3-single"];
  return tiers.find((tier) => sheetCount <= tier.max)?.price || tiers[tiers.length - 1].price;
}

export function getTierPrice(qty, type, coroPricing) {
  let price = coroPricing[type][0].price;
  for (let t of coroPricing[type]) {
    if (qty >= t.min) price = t.price;
  }
  return price;
}

export function getCoroSheetCost(sheetCount, type, coroSheetCost) {
  if (sheetCount <= 9) return coroSheetCost[type][0];
  if (sheetCount <= 50) return coroSheetCost[type][1];
  return coroSheetCost[type][2];
}

export function shippingBySize(w, h, sheets) {
  const max = Math.max(w, h);
  const min = Math.min(w, h);

  function perGroup(rate, groupSize = 3) {
    return Math.ceil(sheets / groupSize) * rate;
  }

  if (max <= 36 && min <= 24) {
    return sheets >= 58 ? 199 : perGroup(10, 3);
  }

  if (max <= 48 && min <= 32) {
    return sheets >= 22 ? 199 : perGroup(15, 3);
  }

  if (max <= 48 && min <= 36) {
    return sheets >= 22 ? 199 : perGroup(35, 3);
  }

  if (max <= 48 && min <= 48) {
    if (sheets >= 10) return 199;
    if (sheets >= 6) return 75;
    return 50;
  }

  if ((max <= 72 && min <= 39) || (max <= 96 && min <= 24)) {
    return sheets >= 10 ? 199 : 75;
  }

  if (max <= 96 && min <= 48) {
    return 199;
  }

  return 199;
}

export function sheetLayoutCount(w, h, qty, allowRotate = true) {
  const sheetW = 48;
  const sheetH = 96;

  const normalAcross = Math.max(Math.floor(sheetW / w), 0);
  const normalDown = Math.max(Math.floor(sheetH / h), 0);
  const normalPerSheet = Math.max(normalAcross * normalDown, 1);

  const rotatedAcross = Math.max(Math.floor(sheetW / h), 0);
  const rotatedDown = Math.max(Math.floor(sheetH / w), 0);
  const rotatedPerSheet = Math.max(rotatedAcross * rotatedDown, 1);

  const useRotated = allowRotate && rotatedPerSheet > normalPerSheet;
  const piecesPerSheet = useRotated ? rotatedPerSheet : normalPerSheet;

  return {
    piecesPerSheet,
    sheetsUsed: qty / piecesPerSheet,
    sheetsRounded: Math.ceil(qty / piecesPerSheet),
    rotated: useRotated,
    across: useRotated ? rotatedAcross : normalAcross,
    down: useRotated ? rotatedDown : normalDown,
  };
}

export function calculateLayout(pieceW, pieceH, qty, rollWidth) {
  const piecesAcross = Math.max(Math.floor(rollWidth / pieceW), 1);
  const rows = Math.ceil(qty / piecesAcross);
  const rawHeight = rows * pieceH;
  const roundedHeight = Math.ceil(rawHeight / 12) * 12;
  const totalSqFt = (rollWidth * roundedHeight) / 144;

  return {
    piecesAcross,
    rows,
    rawHeight,
    roundedHeight,
    totalSqFt,
    pieceW,
    pieceH,
  };
}

export function getVinylBillableSqFt(w, h, qty, gangVinyl, vinylContour, contourPadding, gangWastePercent, rollWidth = 52) {
  const actualEach = (w * h) / 144;
  const pad = vinylContour && gangVinyl ? contourPadding * 2 : 0;

  const effectiveW = w + pad;
  const effectiveH = h + pad;
  const effectiveEach = (effectiveW * effectiveH) / 144;

  if (!gangVinyl) {
    const roundedHeight = Math.ceil(h / 12) * 12;
    const billableEach = (w * roundedHeight) / 144;

    return {
      actualEach,
      effectiveEach: actualEach,
      billableEach,
      totalBillable: billableEach * qty,
      mode: "Single piece billing",
      layoutWidth: w,
      layoutHeight: roundedHeight,
    };
  }

  const normal = calculateLayout(effectiveW, effectiveH, qty, rollWidth);
  const rotated = calculateLayout(effectiveH, effectiveW, qty, rollWidth);

  const best =
    normal.totalSqFt <= rotated.totalSqFt
      ? { ...normal, rotated: false }
      : { ...rotated, rotated: true };

  const wasteMultiplier = vinylContour ? 1 + num(gangWastePercent, 0) / 100 : 1;
  const totalBillable = Math.ceil(best.totalSqFt * wasteMultiplier);

  return {
    actualEach,
    effectiveEach,
    billableEach: totalBillable / qty,
    totalBillable,
    mode: `Ganged layout: ${best.piecesAcross} across x ${best.rows} rows${best.rotated ? " (ROTATED)" : ""}`,
    piecesAcross: best.piecesAcross,
    rows: best.rows,
    layoutWidth: rollWidth,
    layoutHeight: best.roundedHeight,
    rawBillable: best.totalSqFt,
    pieceW: best.pieceW,
    pieceH: best.pieceH,
    rotated: best.rotated,
    normalSqFt: normal.totalSqFt,
    rotatedSqFt: rotated.totalSqFt,
  };
}
