import { useMemo } from "react";
import {
  num,
  getFoamcoreSheetPrice,
  getPvcSheetPrice,
  getTierPrice,
  getCoroSheetCost,
  shippingBySize,
  sheetLayoutCount,
  getVinylBillableSqFt,
} from "../utils/pricingHelpers";
import {
  acrylicOption,
  acrylicStandOffOptions,
  bannerOptions,
  acmOptions,
  vinylOptions,
  coroPricing,
  coroSheetCost,
  foamcoreSheetPricing,
  pvcSheetPricing,
  pvcOptions,
} from "../data/productConfig";

export default function usePricingCalculator({
  product,
  width,
  height,
  qty,
  margin,
  multiplier,
  useDesignFee,
  useSetupFee,
  designFee,
  setupFee,
  delivery,
  activeProduct,
  productMap,
  coroDouble,
  coroFlute,
  stakes,
  heavyStakes,
  grommets,
  gloss,
  coroContour,
  coroRush,
  bannerType,
  polePocket,
  rope,
  windSlits,
  bannerRush,
  meshPolePocket,
  meshGrommets,
  meshWelding,
  meshRope,
  meshWebbing,
  meshRush,
  acmType,
  acmSqFtPrice,
  acmContour,
  roundedCorners,
  acrylicContour,
  acrylicRoundedCorners,
  acrylicStandOffs,
  acrylicStandOffQty,
  acrylicStandOffColor,
  vinylType,
  vinylLaminate,
  vinylContour,
  vinylRush,
  gangVinyl,
  contourPadding,
  gangWastePercent,
  posterRush,
  foamcoreDouble,
  foamcoreContour,
  foamcoreGloss,
  foamcoreRush,
  foamcoreCustomCut,
  pvcType,
  pvcContour,
  pvcRush,
  pvcCustomCut,
  vehicleMagnetMode,
  vehicleMagnetPreset,
  vehicleMagnetContour,
  vehicleMagnetRush,
  businessCardQty,
  businessCardSides,
  businessCardRush,
  handheldPaperSize,
  handheldPaperSides,
  handheldPaperRush,
}) {
  const calc = useMemo(() => {
    const q = Math.max(num(qty, 1), 1);
    const w = num(width);
    const h = num(height);
    const m = Math.min(num(margin, 60), 95) / 100;
    const mult = num(multiplier, 1);

    const fees = (useDesignFee ? num(designFee) : 0) + (useSetupFee ? num(setupFee) : 0) + num(delivery);

    const sqInEach = w * h;

    if (!activeProduct) {
      return { label: productMap[product]?.label || "Coming Soon", retail: 0, each: 0, cost: 0, profit: 0, margin: 0, totalSqFt: 0, materialCost: 0, shipping: 0, comingSoon: true };
    }
    const sqFtEach = sqInEach / 144;
    const totalSqFt = sqFtEach * q;

    if (product === "vinyl" || product === "reflective" || product === "footprints") {
      const v = vinylOptions[vinylType];
      const isReflective = product === "reflective";
      const isFootprints = product === "footprints";
      const materialName = isReflective ? "Oralite 5600 Reflective Film" : isFootprints ? "Footprints Vinyl" : v.name;
      const rateCost = isReflective ? 8 : isFootprints ? 2.5 : v.cost;
      const rateRetail = isReflective ? 8 : isFootprints ? 0 : v.retail;
      const vinylSqFt = getVinylBillableSqFt(w, h, q, gangVinyl, vinylContour, num(contourPadding, 0.5), num(gangWastePercent, 0), 52);
      const materialCost = vinylSqFt.totalBillable * rateCost;
      const shipping = vinylSqFt.totalBillable >= 1000 ? 199 : 10;
      const directCost = materialCost + shipping;
      const marginCostBase = materialCost;
      let shopPrice = isFootprints ? 0 : vinylSqFt.totalBillable * rateRetail;
      let costMarginPrice = marginCostBase / (1 - m);
      if (vinylContour) {
        shopPrice *= 1.1;
        costMarginPrice *= 1.1;
      }
      if (vinylRush) {
        shopPrice *= 2;
        costMarginPrice *= 2;
      }
      costMarginPrice += shipping;
      const basePrice = isFootprints ? costMarginPrice : Math.max(shopPrice, costMarginPrice);
      const retail = (basePrice + fees) * mult;
      return { label: isReflective ? "Reflective Vinyl" : isFootprints ? "Footprints Vinyl" : "Printed Vinyl", retail, each: retail / q, cost: directCost, profit: retail - directCost, margin: retail ? ((retail - directCost) / retail) * 100 : 0, totalSqFt: vinylSqFt.totalBillable, actualTotalSqFt: vinylSqFt.actualEach * q, actualSqFtEach: vinylSqFt.actualEach, effectiveSqFtEach: vinylSqFt.effectiveEach, billableSqFtEach: vinylSqFt.billableEach, billingMode: vinylSqFt.mode, layoutWidth: vinylSqFt.layoutWidth, layoutHeight: vinylSqFt.layoutHeight, rawBillableSqFt: vinylSqFt.rawBillable, piecesAcross: vinylSqFt.piecesAcross, rows: vinylSqFt.rows, pieceW: vinylSqFt.pieceW, pieceH: vinylSqFt.pieceH, rotated: vinylSqFt.rotated, normalSqFt: vinylSqFt.normalSqFt, rotatedSqFt: vinylSqFt.rotatedSqFt, materialCost, shipping, shopPrice, costMarginPrice, basePrice, materialName, rollWidth: 52 };
    }

    if (product === "poster") {
      const rate = totalSqFt >= 5000 ? 1 : totalSqFt >= 1000 ? 1.5 : 2;
      const materialCost = totalSqFt * rate;
      const shipping = w >= 123 || h >= 123 || totalSqFt >= 1000 ? 199 : 10;
      const directCost = materialCost + shipping;
      const marginCostBase = materialCost;
      let costMarginPrice = marginCostBase / (1 - m);
      if (posterRush) costMarginPrice *= 2;
      costMarginPrice += shipping;
      const basePrice = costMarginPrice;
      const retail = (basePrice + fees) * mult;
      return { label: "Poster Paper", retail, each: retail / q, cost: directCost, profit: retail - directCost, margin: retail ? ((retail - directCost) / retail) * 100 : 0, totalSqFt, materialCost, shipping, supplierRate: rate, costMarginPrice, basePrice };
    }

    if (product === "businessCards") {
      const pricing = {
        250: { single: 39.99, double: 49.99 },
        500: { single: 49.99, double: 59.99 },
        1000: { single: 59.99, double: 69.99 },
      };
      const baseRetail = pricing[businessCardQty]?.[businessCardSides] || 0;
      const shipping = Math.ceil(1 / 100) * 10;
      const basePrice = businessCardRush ? baseRetail * 2 : baseRetail;
      const retail = (basePrice + fees) * mult;
      const directCost = shipping;
      return { label: "Business Cards", retail, each: retail / Math.max(Number(businessCardQty) || 1, 1), cost: directCost, profit: retail - directCost, margin: retail ? ((retail - directCost) / retail) * 100 : 0, shipping, materialCost: 0, sheetsRounded: 1, piecesPerSheet: Number(businessCardQty) || 0 };
    }

    if (product === "handheld16ptPaper") {
      const piecesPerSheet = Math.max(Number(handheldPaperSize?.perSheet) || 1, 1);
      const sheetsRequired = Math.max(Math.ceil(q / piecesPerSheet), 1);
      const materialCost = sheetsRequired * 2;
      const shipping = Math.ceil(sheetsRequired / 100) * 10;
      const areaEach = Math.max(Number(handheldPaperSize?.w) * Number(handheldPaperSize?.h) || 1, 1);
      const bcArea = 7;
      const ratePerSqIn = q >= 1000 ? (59.99 / 1000) / bcArea : q >= 500 ? (49.99 / 500) / bcArea : (39.99 / 250) / bcArea;
      const areaBasedRetail = q * areaEach * ratePerSqIn;
      let costMarginPrice = materialCost / (1 - m);
      let basePrice = Math.max(areaBasedRetail, costMarginPrice);
      if (handheldPaperRush) basePrice *= 2;
      const retail = (basePrice + shipping + fees) * mult;
      const directCost = materialCost + shipping;
      const nextFullSheetQty = Math.ceil(q / piecesPerSheet) * piecesPerSheet;
      const addMoreQty = nextFullSheetQty > q ? nextFullSheetQty - q : piecesPerSheet;
      return { label: "Handheld 16pt Paper", retail, each: retail / q, cost: directCost, profit: retail - directCost, margin: retail ? ((retail - directCost) / retail) * 100 : 0, materialCost, shipping, sheetsRounded: sheetsRequired, piecesPerSheet, sideLabel: handheldPaperSides === "double" ? "Double Sided" : "Single Sided", nextFullSheetQty, addMoreQty, costMarginPrice, areaEach, ratePerSqIn };
    }

    if (product === "banner") {
      const b = bannerOptions[bannerType];
      const perimeterFt = (w * 2 + h * 2) / 12;
      const materialCost = totalSqFt * b.cost;
      let basePrice = totalSqFt * b.retail;
      const shipping = totalSqFt >= 1000 ? 199 : 10;
      if (polePocket) basePrice += perimeterFt * q + 10;
      if (rope) basePrice += perimeterFt * q;
      if (windSlits) basePrice += totalSqFt * 0.5;
      if (bannerRush) basePrice *= 2;
      const retail = (basePrice + fees) * mult;
      return { label: "Banner", retail, each: retail / q, cost: materialCost + shipping, profit: retail - (materialCost + shipping), margin: retail ? ((retail - (materialCost + shipping)) / retail) * 100 : 0, totalSqFt, materialCost, shipping, basePrice };
    }

    if (product === "meshBanner") {
      const perimeterFt = (w * 2 + h * 2) / 12;
      const supplierRate = totalSqFt >= 5000 ? 0.99 : totalSqFt >= 2500 ? 1.09 : totalSqFt >= 1000 ? 1.49 : 2.44;
      const materialCost = totalSqFt * supplierRate;
      const oversizedFreight = w >= 123 && h >= 123;
      const shipping = totalSqFt >= 1000 || oversizedFreight ? 199 : 10;
      const polePocketCost = meshPolePocket ? perimeterFt * q + 10 : 0;
      const ropeCost = meshRope ? perimeterFt * q : 0;
      const webbingCost = meshWebbing ? perimeterFt * q : 0;
      const optionsCost = polePocketCost + ropeCost + webbingCost;
      const directCost = materialCost + shipping + optionsCost;
      let costMarginPrice = (materialCost + optionsCost) / (1 - m);
      if (meshRush) costMarginPrice *= 2;
      costMarginPrice += shipping;
      const basePrice = costMarginPrice;
      const retail = (basePrice + fees) * mult;
      return { label: "Mesh Banner", retail, each: retail / q, cost: directCost, profit: retail - directCost, margin: retail ? ((retail - directCost) / retail) * 100 : 0, totalSqFt, materialCost, shipping, supplierRate, polePocketCost, ropeCost, webbingCost, optionsCost, costMarginPrice, basePrice };
    }

    if (product === "acm") {
      const a = acmOptions[acmType];
      const costEach = Math.max(sqInEach * a.costPerSqIn, a.minCost);
      const layout = sheetLayoutCount(w, h, q, true);
      const sheetsUsed = layout.sheetsUsed;
      const sheetsRounded = layout.sheetsRounded;
      const materialCost = costEach * q;
      const shipping = shippingBySize(w, h, sheetsRounded);
      const directCost = materialCost + shipping;
      const marginCostBase = materialCost;
      let costMarginPrice = marginCostBase / (1 - m);
      let shopPrice = totalSqFt * num(acmSqFtPrice, 18);
      if (acmContour) {
        costMarginPrice *= 1.1;
        shopPrice *= 1.1;
      }
      if (roundedCorners) {
        costMarginPrice += 5;
        shopPrice += 5;
      }
      costMarginPrice += shipping;
      const basePrice = Math.max(costMarginPrice, shopPrice);
      const retail = (basePrice + fees) * mult;
      return { label: "ACM / Maxmetal", retail, each: retail / q, cost: directCost, profit: retail - directCost, margin: retail ? ((retail - directCost) / retail) * 100 : 0, totalSqFt, materialCost, shipping, sheetsUsed, sheetsRounded, piecesPerSheet: layout.piecesPerSheet, sheetLayout: `${layout.across} across x ${layout.down} down${layout.rotated ? " (rotated)" : ""}`, costMarginPrice, shopPrice, basePrice };
    }

    if (product === "acrylic") {
      const costEach = Math.max(sqInEach * acrylicOption.costPerSqIn, acrylicOption.minCost);
      const layout = sheetLayoutCount(w, h, q, true);
      const sheetsRounded = layout.sheetsRounded;
      const materialCost = costEach * q;
      const shipping = shippingBySize(w, h, sheetsRounded);
      const standOff = acrylicStandOffOptions[acrylicStandOffColor];
      const standOffQty = acrylicStandOffs ? Math.max(num(acrylicStandOffQty, 0), 0) : 0;
      const standOffDirectCost = standOffQty * standOff.directEach;
      const standOffRetailCharge = standOffQty * standOff.retailEach;
      const directCost = materialCost + standOffDirectCost + shipping;
      let costMarginPrice = materialCost / (1 - m);
      if (acrylicContour) costMarginPrice *= 1.1;
      if (acrylicRoundedCorners) costMarginPrice += 5;
      costMarginPrice += shipping;
      const retail = (costMarginPrice + standOffRetailCharge + fees) * mult;
      return { label: "Acrylic", retail, each: retail / q, cost: directCost, profit: retail - directCost, margin: retail ? ((retail - directCost) / retail) * 100 : 0, totalSqFt, materialCost, shipping, sheetsUsed: layout.sheetsUsed, sheetsRounded, piecesPerSheet: layout.piecesPerSheet, sheetLayout: `${layout.across} across x ${layout.down} down${layout.rotated ? " (rotated)" : ""}`, standOffQty, standOffColor: standOff.name, standOffDirectCost, standOffRetailCharge, costMarginPrice, basePrice: costMarginPrice + standOffRetailCharge };
    }

    if (product === "foamcore") {
      const layout = sheetLayoutCount(w, h, q, true);
      const sheetsUsed = Math.max(layout.sheetsUsed, 1);
      const sheetsRounded = Math.max(layout.sheetsRounded, 1);
      const sheetPrice = getFoamcoreSheetPrice(sheetsRounded, foamcoreDouble, foamcoreSheetPricing);
      const materialCost = sheetsRounded * sheetPrice;
      const shipping = shippingBySize(w, h, sheetsRounded);
      const directCost = materialCost + shipping;
      const marginCostBase = materialCost;
      const costPerPiece = materialCost / q;
      let costMarginPrice = marginCostBase / (1 - m);
      if (foamcoreContour) costMarginPrice *= 1.1;
      if (foamcoreGloss) costMarginPrice += q * 4;
      if (foamcoreRush) costMarginPrice *= 2;
      costMarginPrice += shipping;
      const basePrice = costMarginPrice;
      const retail = (basePrice + fees) * mult;
      return { label: "Foamcore", quantity: q, retail, each: retail / q, cost: directCost, profit: retail - directCost, margin: retail ? ((retail - directCost) / retail) * 100 : 0, totalSqFt, materialCost, shipping, sheetsUsed, sheetsRounded, piecesPerSheet: layout.piecesPerSheet, sheetLayout: `${layout.across} across x ${layout.down} down${layout.rotated ? " (rotated)" : ""}`, sheetAcross: layout.across, sheetDown: layout.down, sheetRotated: layout.rotated, previewPieceW: layout.rotated ? h : w, previewPieceH: layout.rotated ? w : h, sheetPrice, costPerPiece, costMarginPrice, basePrice };
    }

    if (product === "pvc") {
      const layout = sheetLayoutCount(w, h, q, true);
      const sheetsUsed = Math.max(layout.sheetsUsed, 1);
      const sheetsRounded = Math.max(layout.sheetsRounded, 1);
      const sheetPrice = getPvcSheetPrice(sheetsRounded, pvcType, pvcSheetPricing);
      const materialCost = sheetsRounded * sheetPrice;
      const shipping = shippingBySize(w, h, sheetsRounded);
      const directCost = materialCost + shipping;
      const costPerPiece = materialCost / q;
      let costMarginPrice = materialCost / (1 - m);
      if (pvcContour) costMarginPrice *= 1.1;
      if (pvcRush) costMarginPrice *= 2;
      costMarginPrice += shipping;
      const basePrice = costMarginPrice;
      const retail = (basePrice + fees) * mult;
      return { label: "PVC", quantity: q, retail, each: retail / q, cost: directCost, profit: retail - directCost, margin: retail ? ((retail - directCost) / retail) * 100 : 0, totalSqFt, materialCost, shipping, sheetsUsed, sheetsRounded, piecesPerSheet: layout.piecesPerSheet, sheetLayout: `${layout.across} across x ${layout.down} down${layout.rotated ? " (rotated)" : ""}`, sheetAcross: layout.across, sheetDown: layout.down, sheetRotated: layout.rotated, previewPieceW: layout.rotated ? h : w, previewPieceH: layout.rotated ? w : h, sheetPrice, costPerPiece, pvcType: pvcOptions[pvcType].name, costMarginPrice, basePrice };
    }

    if (product === "vehicleMagnets") {
      const standardBaseCosts = { "18x12": 11.95, "24x12": 14.95, "24x18": 20.95, "42x12": 29.95, "72x24": 89.7 };
      let pieceCost = vehicleMagnetMode === "custom" ? sqInEach * 0.07 : (standardBaseCosts[vehicleMagnetPreset] || 11.95);
      if (vehicleMagnetMode === "custom" && vehicleMagnetContour) pieceCost *= 1.1;
      const materialCost = pieceCost * q;
      let shipping = 10;
      const totalSqIn = sqInEach * q;
      if (vehicleMagnetMode === "standard") {
        shipping = q >= 191 ? 199 : Math.ceil(q / 10) * 10;
      } else {
        shipping = totalSqIn >= 40500 ? 199 : 10;
      }
      const directCost = materialCost + shipping;
      let costMarginPrice = materialCost / (1 - m);
      if (vehicleMagnetRush) costMarginPrice *= 2;
      costMarginPrice += shipping;
      const retail = (costMarginPrice + fees) * mult;
      return { label: vehicleMagnetMode === "custom" ? "Custom Cut Vehicle Magnets" : "Standard Vehicle Magnets", retail, each: retail / q, cost: directCost, profit: retail - directCost, margin: retail ? ((retail - directCost) / retail) * 100 : 0, totalSqFt, materialCost, shipping, totalSqIn, sqInEach, costMarginPrice, basePrice: costMarginPrice };
    }

    const type = coroDouble ? "double" : "single";
    const scale = w === 18 && h === 12 ? 0.5 : 1;
    const tierEach = getTierPrice(q, type, coroPricing) * scale;
    let tierPrice = tierEach * q;
    if (heavyStakes) tierPrice += q * 2.25;
    if (grommets) tierPrice += q * 0.25 + 15;
    if (gloss) tierPrice += q * 4;
    if (coroContour) tierPrice *= 1.1;
    if (coroRush) tierPrice *= 2;
    const allowRotate = coroFlute === "best";
    const layout = sheetLayoutCount(w, h, q, allowRotate);
    const sheetsUsed = layout.sheetsUsed;
    const sheetsRounded = layout.sheetsRounded;
    const materialCost = getCoroSheetCost(sheetsRounded, type, coroSheetCost) * sheetsRounded;
    const shipping = shippingBySize(w, h, sheetsRounded);
    const stakeRetail = stakes ? q * 2.0 : 0;
    const stakeCost = stakes ? q * 1.25 : 0;
    const directCost = materialCost + shipping + stakeCost;
    const marginCostBase = materialCost;
    const costMarginPrice = marginCostBase / (1 - m) + shipping;
    const basePrice = Math.max(tierPrice, costMarginPrice);
    const retail = (basePrice + fees) * mult + stakeRetail;

    return { label: "Coroplast", retail, each: retail / q, cost: directCost, profit: retail - directCost, margin: retail ? ((retail - directCost) / retail) * 100 : 0, totalSqFt, materialCost, shipping, stakeRetail, stakeCost, sheetsUsed, sheetsRounded, piecesPerSheet: layout.piecesPerSheet, sheetLayout: `${layout.across} across x ${layout.down} down${layout.rotated ? " (rotated)" : ""}`, tierPrice, costMarginPrice, basePrice };
  }, [product, width, height, qty, margin, multiplier, useDesignFee, useSetupFee, designFee, setupFee, delivery, activeProduct, productMap, coroDouble, coroFlute, stakes, heavyStakes, grommets, gloss, coroContour, coroRush, bannerType, polePocket, rope, windSlits, bannerRush, meshPolePocket, meshGrommets, meshWelding, meshRope, meshWebbing, meshRush, acmType, acmSqFtPrice, acmContour, roundedCorners, acrylicContour, acrylicRoundedCorners, acrylicStandOffs, acrylicStandOffQty, acrylicStandOffColor, vinylType, vinylLaminate, vinylContour, vinylRush, gangVinyl, contourPadding, gangWastePercent, posterRush, foamcoreDouble, foamcoreContour, foamcoreGloss, foamcoreRush, foamcoreCustomCut, pvcType, pvcContour, pvcRush, pvcCustomCut, vehicleMagnetMode, vehicleMagnetPreset, vehicleMagnetContour, vehicleMagnetRush, businessCardQty, businessCardSides, businessCardRush, handheldPaperSize, handheldPaperSides, handheldPaperRush]);

  return calc;
}
