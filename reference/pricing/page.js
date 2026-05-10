"use client";

import { useEffect, useState } from "react";
import PricingSummary from "../components/PricingSummary";
import ProductOptions from "../components/ProductOptions";
import ProductNavigation from "../components/ProductNavigation";
import { Box, Check, Field, input } from "../components/FormControls";
import { money, num } from "../utils/pricingHelpers";
import usePricingCalculator from "../hooks/usePricingCalculator";
import { getCategoryTheme } from "../utils/categoryTheme";
import { products, acrylicStandOffOptions, productCategories, bannerOptions, acmOptions, vinylOptions, pvcOptions } from "../data/productConfig";

const productMap = Object.fromEntries(productCategories.flatMap((c) => c.items.map((i) => [i.id, i])));
const allProducts = productCategories.flatMap((c) => c.items.map((i) => ({ ...i, category: c.name })));

export default function Page() {
  const handheldPaperSizes = [
    { key: '3.5x2.5', label: '3.5"x2.5" Trading Card', perSheet: 56, w: 3.5, h: 2.5 },
    { key: '5x3', label: '5"x3"', perSheet: 30, w: 5, h: 3 },
    { key: '6x4', label: '6"x4"', perSheet: 21, w: 6, h: 4 },
    { key: '7x5', label: '7"x5"', perSheet: 12, w: 7, h: 5 },
    { key: '9x4', label: '9"x4"', perSheet: 14, w: 9, h: 4 },
    { key: '9x6', label: '9"x6"', perSheet: 9, w: 9, h: 6 },
    { key: '11x8.5', label: '11"x8.5"', perSheet: 5, w: 11, h: 8.5 },
    { key: '14x11', label: '14"x11"', perSheet: 2, w: 14, h: 11 },
    { key: '16x12', label: '16"x12"', perSheet: 2, w: 16, h: 12 },
    { key: '17x11', label: '17"x11"', perSheet: 2, w: 17, h: 11 },
    { key: '12x18', label: '12"x18"', perSheet: 2, w: 12, h: 18 },
    { key: '20x16', label: '20"x16"', perSheet: 1, w: 20, h: 16 },
    { key: '18x28', label: '18"x28"', perSheet: 1, w: 18, h: 28 },
  ];

  const handleProductSelect = (nextProduct) => {
    setProduct(nextProduct);
    if (typeof window === "undefined" || window.innerWidth > 800) return;
    window.requestAnimationFrame(() => {
      const toQuoteDetails = ["dtfTransfers", "screenPrinting"].includes(nextProduct);
      const anchorId = toQuoteDetails ? "quote-details-anchor" : "quick-presets-anchor";
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const [product, setProduct] = useState("");
  const [width, setWidth] = useState(24);
  const [height, setHeight] = useState(18);
  const [qty, setQty] = useState(1);
  const [margin, setMargin] = useState(60);
  const [multiplier, setMultiplier] = useState(1);

  const [useDesignFee, setUseDesignFee] = useState(false);
  const [useSetupFee, setUseSetupFee] = useState(false);
  const [designFee, setDesignFee] = useState("");
  const [setupFee, setSetupFee] = useState("");
  const [delivery, setDelivery] = useState("");

  const [coroDouble, setCoroDouble] = useState(false);
  const [coroFlute, setCoroFlute] = useState("vertical");
  const [stakes, setStakes] = useState(false);
  const [heavyStakes, setHeavyStakes] = useState(false);
  const [grommets, setGrommets] = useState(false);
  const [gloss, setGloss] = useState(false);
  const [coroContour, setCoroContour] = useState(false);
  const [coroRush, setCoroRush] = useState(false);

  const [bannerType, setBannerType] = useState("13-single");
  const [polePocket, setPolePocket] = useState(false);
  const [rope, setRope] = useState(false);
  const [windSlits, setWindSlits] = useState(false);
  const [bannerRush, setBannerRush] = useState(false);
  const [meshPolePocket, setMeshPolePocket] = useState(false);
  const [meshGrommets, setMeshGrommets] = useState(false);
  const [meshWelding, setMeshWelding] = useState(false);
  const [meshRope, setMeshRope] = useState(false);
  const [meshWebbing, setMeshWebbing] = useState(false);
  const [meshRush, setMeshRush] = useState(false);

  const [acmType, setAcmType] = useState("3-single");
  const [acmSqFtPrice, setAcmSqFtPrice] = useState(18);
  const [acmContour, setAcmContour] = useState(false);
  const [roundedCorners, setRoundedCorners] = useState(false);
  const [acrylicContour, setAcrylicContour] = useState(false);
  const [acrylicRoundedCorners, setAcrylicRoundedCorners] = useState(false);
  const [acrylicStandOffs, setAcrylicStandOffs] = useState(false);
  const [acrylicStandOffQty, setAcrylicStandOffQty] = useState(4);
  const [acrylicStandOffColor, setAcrylicStandOffColor] = useState("silver");

  const [vinylType, setVinylType] = useState("gf-standard");
  const [vinylLaminate, setVinylLaminate] = useState("Gloss Laminate");
  const [vinylContour, setVinylContour] = useState(false);
  const [vinylRush, setVinylRush] = useState(false);
  const [gangVinyl, setGangVinyl] = useState(false);
  const [contourPadding, setContourPadding] = useState(0.5);
  const [gangWastePercent, setGangWastePercent] = useState(15);

  const [posterRush, setPosterRush] = useState(false);
  const [foamcoreDouble, setFoamcoreDouble] = useState(false);
  const [foamcoreContour, setFoamcoreContour] = useState(false);
  const [foamcoreGloss, setFoamcoreGloss] = useState(false);
  const [foamcoreRush, setFoamcoreRush] = useState(false);
  const [foamcoreCustomCut, setFoamcoreCustomCut] = useState(false);
  const [pvcType, setPvcType] = useState("3-single");
  const [pvcContour, setPvcContour] = useState(false);
  const [pvcRush, setPvcRush] = useState(false);
  const [pvcCustomCut, setPvcCustomCut] = useState(false);
  const [vehicleMagnetMode, setVehicleMagnetMode] = useState("standard");
  const [vehicleMagnetPreset, setVehicleMagnetPreset] = useState("18x12");
  const [vehicleMagnetContour, setVehicleMagnetContour] = useState(false);
  const [vehicleMagnetRoundedCorners, setVehicleMagnetRoundedCorners] = useState(false);
  const [vehicleMagnetRush, setVehicleMagnetRush] = useState(false);
  const [vehicleMagnetNotes, setVehicleMagnetNotes] = useState("");
  const [businessCardQty, setBusinessCardQty] = useState(250);
  const [businessCardSides, setBusinessCardSides] = useState("single");
  const [businessCardCoating, setBusinessCardCoating] = useState("Gloss Laminate");
  const [businessCardOrientation, setBusinessCardOrientation] = useState("Landscape");
  const [businessCardRush, setBusinessCardRush] = useState(false);
  const [handheldPaperSizeKey, setHandheldPaperSizeKey] = useState("3.5x2.5");
  const [handheldPaperSides, setHandheldPaperSides] = useState("single");
  const [handheldPaperCoating, setHandheldPaperCoating] = useState("Gloss Laminate");
  const [handheldPaperOrientation, setHandheldPaperOrientation] = useState("Landscape");
  const [handheldPaperRush, setHandheldPaperRush] = useState(false);
  const [theme, setTheme] = useState("light");
  const [viewMode, setViewMode] = useState("customer-online");
  const [staffUnlocked, setStaffUnlocked] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [presetProduct, setPresetProduct] = useState("");
  const [dtfSummary, setDtfSummary] = useState(null);

  const activeProduct = productMap[product]?.calculator || null;
  const handheldPaperSize = handheldPaperSizes.find((x) => x.key === handheldPaperSizeKey) || handheldPaperSizes[0];
  const activeTheme = getCategoryTheme(product || activeProduct || "");


  useEffect(() => {
    const savedTheme = typeof window !== "undefined" ? localStorage.getItem("hue-theme") : null;
    if (savedTheme === "dark") setTheme("dark");
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("hue-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedMode = localStorage.getItem("hue-staff-mode");
    if (savedMode === "customer-online" || savedMode === "customer-in-store" || savedMode === "admin") {
      setStaffUnlocked(true);
      setViewMode(savedMode);
    }
  }, []);

  const unlockStaffMode = () => {
    if (typeof window === "undefined") return;
    const entered = window.prompt("Enter staff password");
    if (entered === "HUE2026") {
      setStaffUnlocked(true);
      setViewMode("customer-in-store");
      localStorage.setItem("hue-staff-mode", "customer-in-store");
    } else if (entered !== null) {
      window.alert("Incorrect password.");
    }
  };

  const setStaffMode = (nextMode) => {
    setViewMode(nextMode);
    if (typeof window !== "undefined") localStorage.setItem("hue-staff-mode", nextMode);
  };

  const lockStaffMode = () => {
    if (typeof window === "undefined") return;
    setStaffUnlocked(false);
    setViewMode("customer-online");
    setShowBreakdown(false);
    localStorage.removeItem("hue-staff-mode");
  };

  useEffect(() => {
    const linked = activeProduct && presetGroups[activeProduct] ? activeProduct : "";
    setPresetProduct(linked);
  }, [activeProduct]);

  useEffect(() => {
    if (activeProduct !== "vehicleMagnets" || vehicleMagnetMode !== "standard") return;
    const [w, h] = vehicleMagnetPreset.split("x").map(Number);
    if (w && h) {
      setWidth(w);
      setHeight(h);
    }
  }, [activeProduct, vehicleMagnetMode, vehicleMagnetPreset]);

  function resetAll() {
    setProduct(""); setWidth(24); setHeight(18); setQty(1); setMargin(60); setMultiplier(1);
    setUseDesignFee(false); setUseSetupFee(false); setDesignFee(""); setSetupFee(""); setDelivery("");
    setCoroDouble(false); setCoroFlute("vertical"); setStakes(false); setHeavyStakes(false); setGrommets(false); setGloss(false); setCoroContour(false); setCoroRush(false);
    setBannerType("13-single"); setPolePocket(false); setRope(false); setWindSlits(false); setBannerRush(false);
    setMeshPolePocket(false); setMeshGrommets(false); setMeshWelding(false); setMeshRope(false); setMeshWebbing(false); setMeshRush(false);
    setAcmType("3-single"); setAcmSqFtPrice(18); setAcmContour(false); setRoundedCorners(false);
    setAcrylicContour(false); setAcrylicRoundedCorners(false); setAcrylicStandOffs(false); setAcrylicStandOffQty(4); setAcrylicStandOffColor("silver");
    setVinylType("gf-standard"); setVinylLaminate("Gloss Laminate"); setVinylContour(false); setVinylRush(false); setGangVinyl(false); setContourPadding(0.5); setGangWastePercent(15);
    setPosterRush(false);
    setFoamcoreDouble(false); setFoamcoreContour(false); setFoamcoreGloss(false); setFoamcoreRush(false); setFoamcoreCustomCut(false);
    setPvcType("3-single"); setPvcContour(false); setPvcRush(false); setPvcCustomCut(false);
    setVehicleMagnetMode("standard"); setVehicleMagnetPreset("18x12"); setVehicleMagnetContour(false); setVehicleMagnetRoundedCorners(false); setVehicleMagnetRush(false); setVehicleMagnetNotes("");
    setBusinessCardQty(250); setBusinessCardSides("single"); setBusinessCardCoating("Gloss Laminate"); setBusinessCardOrientation("Landscape"); setBusinessCardRush(false);
    setHandheldPaperSizeKey("3.5x2.5"); setHandheldPaperSides("single"); setHandheldPaperCoating("Gloss Laminate"); setHandheldPaperOrientation("Landscape"); setHandheldPaperRush(false);
  }

  function preset(prod, w, h, double = false) {
    setProduct(prod);
    setWidth(w);
    setHeight(h);
    if (prod === "coro") {
      setCoroDouble(double);
      setCoroFlute("vertical");
    }
  }

  function isPresetActive(prod, w, h, double = false) {
    return product === prod && num(width) === w && num(height) === h && (prod !== "coro" || coroDouble === double);
  }

  function presetClass(prod, w, h, double = false) {
    return isPresetActive(prod, w, h, double) ? "presetBtn activePreset" : "presetBtn";
  }


  const presetGroups = {
    coro: [
      { label: "18x24 Single", w: 24, h: 18, double: false },
      { label: "18x24 Double", w: 24, h: 18, double: true },
      { label: "12x18 Single", w: 18, h: 12, double: false },
      { label: "12x18 Double", w: 18, h: 12, double: true },
    ],
    banner: [
      { label: "24x36", w: 36, h: 24 }, { label: "36x60", w: 60, h: 36 }, { label: "36x72", w: 72, h: 36 },
      { label: "36x96", w: 96, h: 36 }, { label: "48x96", w: 96, h: 48 },
    ],
    acm: [
      { label: "18x24", w: 24, h: 18 }, { label: "24x36", w: 24, h: 36 }, { label: "24x48", w: 24, h: 48 },
      { label: "32x48", w: 32, h: 48 }, { label: "36x48", w: 36, h: 48 }, { label: "48x48", w: 48, h: 48 },
      { label: "24x96", w: 24, h: 96 }, { label: "48x96", w: 48, h: 96 },
    ],
    acrylic: [
      { label: "12x18", w: 12, h: 18 }, { label: "18x24", w: 18, h: 24 }, { label: "24x36", w: 24, h: 36 },
      { label: "24x48", w: 24, h: 48 }, { label: "32x48", w: 32, h: 48 }, { label: "36x48", w: 36, h: 48 },
      { label: "48x48", w: 48, h: 48 },
    ],
    meshBanner: [
      { label: "24x36", w: 36, h: 24 }, { label: "36x60", w: 60, h: 36 }, { label: "36x72", w: 72, h: 36 },
      { label: "36x96", w: 96, h: 36 }, { label: "48x96", w: 96, h: 48 }, { label: "60x120", w: 120, h: 60 },
    ],
    vinyl: [
      { label: "12x12", w: 12, h: 12 }, { label: "12x24", w: 24, h: 12 }, { label: "24x24", w: 24, h: 24 },
      { label: "24x36", w: 36, h: 24 }, { label: "24x48", w: 48, h: 24 }, { label: "48x96", w: 96, h: 48 },
    ],
    footprints: [
      { label: "12x12", w: 12, h: 12 }, { label: "12x24", w: 24, h: 12 }, { label: "24x24", w: 24, h: 24 },
      { label: "24x36", w: 36, h: 24 }, { label: "24x48", w: 48, h: 24 }, { label: "48x96", w: 96, h: 48 },
    ],
    reflective: [
      { label: "12x12", w: 12, h: 12 }, { label: "12x24", w: 24, h: 12 }, { label: "24x24", w: 24, h: 24 },
      { label: "24x36", w: 36, h: 24 }, { label: "24x48", w: 48, h: 24 }, { label: "48x96", w: 96, h: 48 },
    ],
    poster: [
      { label: "11x17", w: 17, h: 11 }, { label: "18x24", w: 24, h: 18 }, { label: "24x36", w: 36, h: 24 },
      { label: "36x48", w: 48, h: 36 }, { label: "48x72", w: 72, h: 48 }, { label: "48x96", w: 96, h: 48 },
    ],
    foamcore: [
      { label: "12x18", w: 12, h: 18 }, { label: "18x24", w: 18, h: 24 }, { label: "24x36", w: 24, h: 36 },
      { label: "24x48", w: 24, h: 48 }, { label: "32x48", w: 32, h: 48 },
    ],
    pvc: [
      { label: "12x18", w: 12, h: 18 }, { label: "18x24", w: 18, h: 24 }, { label: "24x36", w: 24, h: 36 },
      { label: "24x48", w: 24, h: 48 }, { label: "32x48", w: 32, h: 48 }, { label: "36x48", w: 36, h: 48 },
      { label: "48x48", w: 48, h: 48 },
    ],
  };

  const calc = usePricingCalculator({
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
  });

  const isAdminView = viewMode === "admin";
  const isCustomerOnlineView = viewMode === "customer-online";
  const showInternalFields = !isCustomerOnlineView;
  const isStaffUnlocked = staffUnlocked;

  const selectedDetails = {
    product,
    productName: productMap[product]?.label || products[activeProduct] || "Unknown Product",
    size: activeProduct === "handheld16ptPaper" ? handheldPaperSize.label : activeProduct === "businessCards" ? 'Standard Business Card' : `${num(width)}" x ${num(height)}"`,
    qty: activeProduct === "businessCards" ? businessCardQty : num(qty, 1),
    sheetHint: activeProduct === "handheld16ptPaper" ? `Next full sheet quantity: ${calc.nextFullSheetQty || handheldPaperSize.perSheet}` : null,
    sheetAddMore: activeProduct === "handheld16ptPaper" ? `Add ${calc.addMoreQty || handheldPaperSize.perSheet} more to fill the sheet for best value.` : null,
    material:
      activeProduct === "vinyl"
        ? `${vinylOptions[vinylType].name} / ${vinylLaminate}`
        : activeProduct === "reflective"
        ? "Oralite 5600 Reflective Film"
        : activeProduct === "footprints"
        ? "Footprints Vinyl"
        : activeProduct === "banner"
        ? bannerOptions[bannerType].name
        : activeProduct === "meshBanner"
        ? "Mesh Banner Material"
        : activeProduct === "acm"
        ? acmOptions[acmType].name
        : activeProduct === "poster"
        ? "Poster Paper"
        : activeProduct === "acrylic"
        ? "Acrylic"
        : activeProduct === "foamcore"
        ? foamcoreDouble ? "Foamcore Double-Sided" : "Foamcore Single-Sided"
        : activeProduct === "pvc"
        ? pvcOptions[pvcType].name
        : activeProduct === "vehicleMagnets"
        ? vehicleMagnetMode === "custom" ? "Custom Cut Vehicle Magnet" : "Standard Vehicle Magnet"
        : activeProduct === "businessCards"
        ? `Business Cards (${businessCardSides === "double" ? "Double" : "Single"} Sided)`
        : activeProduct === "handheld16ptPaper"
        ? `Handheld 16pt Paper (${handheldPaperSize.label})`
        : coroDouble
        ? "4mm Double-Sided Coroplast"
        : activeProduct === "coro"
        ? "4mm Single-Sided Coroplast"
        : "Pricing coming soon",
    options: [
      activeProduct === "vinyl" ? `Vinyl Type: ${vinylOptions[vinylType].name}` : null,
      activeProduct === "vinyl" ? `Laminate: ${vinylLaminate}` : null,
      activeProduct === "reflective" ? "Material: Oralite 5600 Reflective Film" : null,
      activeProduct === "banner" ? `Banner Type: ${bannerOptions[bannerType].name}` : null,
      activeProduct === "acm" ? `ACM Type: ${acmOptions[acmType].name}` : null,
      activeProduct === "acrylic" ? "Acrylic Type: Standard" : null,
      activeProduct === "coro" ? (coroDouble ? "Coro: Double-Sided" : "Coro: Single-Sided") : null,
      (["vinyl", "reflective", "footprints"].includes(activeProduct)) && vinylContour ? "Contour Cut" : null,
      (["vinyl", "reflective", "footprints"].includes(activeProduct)) && vinylRush ? "Rush Order" : null,
      (["vinyl", "reflective", "footprints"].includes(activeProduct)) && gangVinyl ? "Gang Vinyl Layout" : null,
      (["vinyl", "reflective", "footprints"].includes(activeProduct)) && vinylContour && gangVinyl
        ? `Contour Padding: ${num(contourPadding, 0.5)}"`
        : null,
      (["vinyl", "reflective", "footprints"].includes(activeProduct)) && vinylContour && gangVinyl
        ? `Gang Waste: ${num(gangWastePercent, 0)}%`
        : null,
      activeProduct === "coro" ? `Flute Direction: ${coroFlute}` : null,
      activeProduct === "coro" && stakes ? "Standard Stakes" : null,
      activeProduct === "coro" && heavyStakes ? "Heavy Duty Stakes" : null,
      activeProduct === "coro" && grommets ? "Grommets" : null,
      activeProduct === "coro" && gloss ? "Gloss Finish" : null,
      activeProduct === "coro" && coroContour ? "Contour Cut" : null,
      activeProduct === "coro" && coroRush ? "Rush Order" : null,
      activeProduct === "banner" && polePocket ? "Pole Pocket" : null,
      activeProduct === "banner" && rope ? "Rope" : null,
      activeProduct === "banner" && windSlits ? "Wind Slits" : null,
      activeProduct === "banner" && bannerRush ? "Rush Order" : null,
      activeProduct === "meshBanner" && meshPolePocket ? "Pole Pocket" : null,
      activeProduct === "meshBanner" && meshGrommets ? "Grommets" : null,
      activeProduct === "meshBanner" && meshWelding ? "Welding" : null,
      activeProduct === "meshBanner" && meshRope ? "Rope" : null,
      activeProduct === "meshBanner" && meshWebbing ? "Webbing" : null,
      activeProduct === "meshBanner" && meshRush ? "Rush Order" : null,
      activeProduct === "acm" && acmContour ? "Contour Cut" : null,
      activeProduct === "acm" && roundedCorners ? "Rounded Corners" : null,
      activeProduct === "acrylic" && acrylicContour ? "Contour Cut" : null,
      activeProduct === "acrylic" && acrylicRoundedCorners ? "Rounded Corners" : null,
      activeProduct === "acrylic" && acrylicStandOffs
        ? `Stand-Offs: ${Math.max(num(acrylicStandOffQty, 0), 0)} ${acrylicStandOffOptions[acrylicStandOffColor].name}`
        : null,
      activeProduct === "poster" && posterRush ? "Rush Order" : null,
      activeProduct === "foamcore" ? (foamcoreDouble ? "Foamcore: Double-Sided" : "Foamcore: Single-Sided") : null,
      activeProduct === "foamcore" && foamcoreContour ? "Contour Cut" : null,
      activeProduct === "foamcore" && foamcoreGloss ? "Gloss Finish" : null,
      activeProduct === "foamcore" && foamcoreRush ? "Rush Order" : null,
      activeProduct === "foamcore" && foamcoreCustomCut ? "Custom Cut" : null,
      activeProduct === "pvc" ? `PVC Type: ${pvcOptions[pvcType].name}` : null,
      activeProduct === "pvc" && pvcContour ? "Contour Cut" : null,
      activeProduct === "pvc" && pvcRush ? "Rush Order" : null,
      activeProduct === "pvc" && pvcCustomCut ? "Custom Cut" : null,
      activeProduct === "vehicleMagnets" ? `Magnet Type: ${vehicleMagnetMode === "custom" ? "Custom Cut" : "Standard"}` : null,
      activeProduct === "vehicleMagnets" && vehicleMagnetMode !== "custom" ? `Size: ${vehicleMagnetPreset}` : null,
      activeProduct === "vehicleMagnets" && vehicleMagnetMode === "custom" ? `Custom Size: ${num(width)}" x ${num(height)}"` : null,
      activeProduct === "vehicleMagnets" && vehicleMagnetContour ? "Contour Cut" : null,
      activeProduct === "vehicleMagnets" && vehicleMagnetRoundedCorners ? "Rounded Corners" : null,
      activeProduct === "vehicleMagnets" && vehicleMagnetRush ? "Rush Order" : null,
      activeProduct === "vehicleMagnets" && vehicleMagnetNotes.trim() ? `Notes: ${vehicleMagnetNotes.trim()}` : null,
      activeProduct === "businessCards" ? `Quantity: ${businessCardQty}` : null,
      activeProduct === "businessCards" ? `${businessCardSides === "double" ? "Double" : "Single"} Sided` : null,
      activeProduct === "businessCards" ? `Coating: ${businessCardCoating}` : null,
      activeProduct === "businessCards" ? `Orientation: ${businessCardOrientation}` : null,
      activeProduct === "businessCards" && businessCardRush ? "Rush Order" : null,
      activeProduct === "handheld16ptPaper" ? `Size: ${handheldPaperSize.label} (${handheldPaperSize.perSheet} per sheet)` : null,
      activeProduct === "handheld16ptPaper" ? `Sides: ${handheldPaperSides === "double" ? "Double" : "Single"}` : null,
      activeProduct === "handheld16ptPaper" ? `Sheets Required: ${calc.sheetsRounded || 1}` : null,
      activeProduct === "handheld16ptPaper" ? `Coating: ${handheldPaperCoating}` : null,
      activeProduct === "handheld16ptPaper" ? `Orientation: ${handheldPaperOrientation}` : null,
      activeProduct === "handheld16ptPaper" && handheldPaperRush ? "Rush Order" : null,
      showInternalFields && useDesignFee ? `Design Fee: ${money(num(designFee))}` : null,
      showInternalFields && useSetupFee ? `Setup Fee: ${money(num(setupFee))}` : null,
      showInternalFields && num(delivery) > 0 ? `Delivery/Install: ${money(num(delivery))}` : null,
      isAdminView && num(multiplier, 1) !== 1 ? `Multiplier: ${num(multiplier, 1)}x` : null,
    ].filter(Boolean),
  };

  return (
    <main className={`appRoot ${theme}`} style={{ fontFamily: "Inter, Arial", minHeight: "100vh", padding: 20, "--accent": activeTheme.accent, "--accent-soft": activeTheme.accentSoft, "--accent-glow": activeTheme.accentGlow, "--divider": activeTheme.divider, "--summary-border": activeTheme.summaryBorder, "--mobile-tint": activeTheme.mobileTint }}>
      <style>{`
        .layout {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 20px;
        }

        .themeToggle{display:flex;gap:8px;align-items:center;margin:8px 0 14px;flex-wrap:wrap;max-width:100%;}
        .modeBtn{padding:6px 10px;border-radius:999px;border:1px solid #94a3b8;background:linear-gradient(180deg,#fff,#e2e8f0);cursor:pointer;box-shadow:0 3px 8px rgba(15,23,42,.12);font-size:13px;line-height:1.2;white-space:nowrap;}
        .modeBtn.active{background:linear-gradient(180deg,#1d4ed8,#1e293b);color:#fff;border-color:#60a5fa;box-shadow:inset 0 2px 6px rgba(0,0,0,.35),0 0 0 2px rgba(96,165,250,.3);}
        .appRoot.light{background:linear-gradient(160deg,#eff6ff,#f8fafc 45%,#fff);color:#0f172a;}
        .appRoot.dark{background:linear-gradient(160deg,#0b1220,#111827 52%,#1f2937);color:#e2e8f0;}
        .summary {
          background: linear-gradient(160deg,#0f172a,#1e293b);
          color: white;
          border:1px solid var(--summary-border);
          padding: 20px;
          border-radius: 16px;
          box-shadow:0 10px 30px rgba(15,23,42,.09), inset 0 1px 0 var(--mobile-tint);
          transition:border-color .25s ease, box-shadow .25s ease;
        }

        .summary.sticky{position:sticky;top:16px;align-self:start;}
        .card {
          background: rgba(255,255,255,.92);
          padding: 20px;
          border-radius: 16px;
          box-shadow:0 10px 30px rgba(15,23,42,.09);
          border-top:1px solid var(--divider);
          transition:border-color .25s ease, box-shadow .25s ease;
        }

        .buttonGrid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 20px;
        }

        .presetBtn, button {
          transition:all .25s ease;
        }
        .presetBtn {
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid #ccc;
          background: rgba(255,255,255,.92);
          font-size: 14px;
        }

        .presetBtn:hover{transform:translateY(-1px); box-shadow:0 8px 16px var(--accent-glow);}
        .presetBtn:active{transform:translateY(1px);}
        .comingSoonBtn{opacity:.7;border-style:dashed;}
        .activePreset {
          background: linear-gradient(160deg,#0f172a,#1e293b);
          color: white;
          box-shadow:0 18px 35px rgba(2,6,23,.35);
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-soft), 0 8px 16px var(--accent-glow);
          font-weight: 700;
        }

        .resetBtn{margin-top:14px;padding:10px 14px;border-radius:10px;border:1px solid #1e3a8a;background:linear-gradient(180deg,#2563eb,#1d4ed8);color:#fff;font-weight:700;cursor:pointer;}
        .mobilePrice{display:none;flex-direction:column;gap:2px;}
        .mobilePriceTop{display:flex;justify-content:space-between;align-items:center;}
        .mobileMeta{font-size:12px;opacity:.95;line-height:1.25;}
        .mobileOptions{font-size:11px;opacity:.88;line-height:1.25;}
        .optionBox{background:#f8fafc;border:1px solid #e2e8f0;border-top:1px solid var(--divider);box-shadow:0 0 0 1px var(--mobile-tint);transition:border-color .25s ease, box-shadow .25s ease;}
        .appRoot.dark .card{background:rgba(15,23,42,.85);color:#e5e7eb;border:1px solid rgba(96,165,250,.25);}
        .appRoot.dark .card h2, .appRoot.dark .card h3, .appRoot.dark .card label, .appRoot.dark .card p{color:#e5e7eb;}
        .appRoot.dark .optionBox{background:rgba(30,41,59,.85);border-color:rgba(148,163,184,.35);}
        .appRoot.dark input, .appRoot.dark select{background:#0f172a;color:#e5e7eb;border:1px solid #334155;}
        .appRoot.dark input::placeholder{color:#94a3b8;}
        .appRoot.dark .presetBtn{background:linear-gradient(180deg,#0f172a,#1e293b);color:#e2e8f0;border-color:#334155;}
        .appRoot.dark .mobilePrice{background:linear-gradient(160deg,#0b1738,#0f172a);color:#f8fafc;border:1px solid var(--summary-border); box-shadow:0 10px 22px var(--accent-glow), inset 0 0 0 1px var(--mobile-tint);}

        .appRoot.dark .activePreset{
          background:linear-gradient(180deg,color-mix(in srgb, var(--accent) 70%, #ffffff 0%),color-mix(in srgb, var(--accent) 78%, #0f172a 22%));
          color:#0b1120;
          border-color:color-mix(in srgb, var(--accent) 65%, #ffffff 35%);
          box-shadow:0 0 0 2px var(--accent-soft),0 10px 20px var(--accent-glow);
        }
        .appRoot.dark .modeBtn.active{
          background:linear-gradient(180deg,#93c5fd,#60a5fa);
          color:#0b1120;
          border-color:#dbeafe;
          box-shadow:0 0 0 2px rgba(147,197,253,.85), inset 0 1px 2px rgba(255,255,255,.35);
        }

        hr{border:none;border-top:1px solid var(--divider);transition:border-color .25s ease;}

        input[type="checkbox"], input[type="radio"]{accent-color:var(--accent); transition:accent-color .25s ease;}

        input, select {
          box-sizing: border-box;
        }

        @media (max-width: 800px) {
          main {
            padding: 10px !important;
          }

          h1 {
            font-size: 30px;
            line-height: 1.1;
          }

          .layout {
            display: flex;
            flex-direction: column;
          }

          .themeToggle{display:flex;gap:6px;align-items:center;margin:8px 0 14px;flex-wrap:wrap;max-width:100%;}
        .modeBtn{padding:6px 9px;border-radius:999px;border:1px solid #94a3b8;background:linear-gradient(180deg,#fff,#e2e8f0);cursor:pointer;box-shadow:0 3px 8px rgba(15,23,42,.12);font-size:12px;max-width:100%;}
        .modeBtn.active{background:linear-gradient(180deg,#1d4ed8,#1e293b);color:#fff;border-color:#60a5fa;box-shadow:inset 0 2px 6px rgba(0,0,0,.35),0 0 0 2px rgba(96,165,250,.3);}
        .appRoot.light{background:linear-gradient(160deg,#eff6ff,#f8fafc 45%,#fff);color:#0f172a;}
        .appRoot.dark{background:linear-gradient(160deg,#0b1220,#111827 52%,#1f2937);color:#e2e8f0;}
        .summary {
            order: -1;
          }
          .summary.sticky{position:static;}
          .mobilePrice{display:flex;position:fixed;left:10px;right:10px;bottom:10px;z-index:30;background:#0f172a;color:#fff;padding:10px 14px;border-radius:12px;justify-content:space-between;align-items:center;box-shadow:0 10px 20px rgba(0,0,0,.35);}

          .buttonGrid {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }

          .presetBtn, button {
          transition:all .25s ease;
        }
        .presetBtn {
            width: 100%;
            font-size: 15px;
            padding: 10px;
          }

          .formGrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <h1>Hue Graphics Quote Form – Beta 2.1</h1>
      <div className="themeToggle">
        <button className={`modeBtn ${theme === "light" ? "active" : ""}`} onClick={() => setTheme("light")}>Light Mode</button>
        <button className={`modeBtn ${theme === "dark" ? "active" : ""}`} onClick={() => setTheme("dark")}>Dark Mode</button>
        {isStaffUnlocked ? (
          <>
            <button className={`modeBtn ${viewMode === "customer-online" ? "active" : ""}`} onClick={() => setStaffMode("customer-online")}>Customer Online</button>
            <button className={`modeBtn ${viewMode === "customer-in-store" ? "active" : ""}`} onClick={() => setStaffMode("customer-in-store")}>Customer/In-Store</button>
            <button className={`modeBtn ${viewMode === "admin" ? "active" : ""}`} onClick={() => setStaffMode("admin")}>Admin</button>
            <button className="modeBtn" onClick={lockStaffMode}>Lock Staff Mode</button>
          </>
        ) : (
          <button className="modeBtn" onClick={unlockStaffMode}>Unlock Staff Mode</button>
        )}
      </div>
      <p>Live Online Quote Form – Beta Version</p>
      <p>Pricing shown is an estimate and may be adjusted after final review, artwork inspection, quantity confirmation, or production requirements.</p>

      <div className="layout">
        <section className="card">
          <ProductNavigation
            activeTheme={activeTheme}
            product={product}
            setProduct={setProduct}
            onProductSelect={handleProductSelect}
            presetProduct={presetProduct}
            setPresetProduct={setPresetProduct}
            productCategories={productCategories}
            products={products}
            presetGroups={presetGroups}
            presetClass={presetClass}
            preset={preset}
          />

                    <ProductOptions
            activeProduct={activeProduct}
            onDtfSummaryChange={setDtfSummary}
            margin={margin}
            multiplier={multiplier}
            grid={grid}
            vinylType={vinylType}
            setVinylType={setVinylType}
            vinylLaminate={vinylLaminate}
            setVinylLaminate={setVinylLaminate}
            vinylContour={vinylContour}
            setVinylContour={setVinylContour}
            vinylRush={vinylRush}
            setVinylRush={setVinylRush}
            gangVinyl={gangVinyl}
            setGangVinyl={setGangVinyl}
            contourPadding={contourPadding}
            setContourPadding={setContourPadding}
            gangWastePercent={gangWastePercent}
            setGangWastePercent={setGangWastePercent}
            coroFlute={coroFlute}
            setCoroFlute={setCoroFlute}
            coroDouble={coroDouble}
            setCoroDouble={setCoroDouble}
            stakes={stakes}
            setStakes={setStakes}
            heavyStakes={heavyStakes}
            setHeavyStakes={setHeavyStakes}
            grommets={grommets}
            setGrommets={setGrommets}
            gloss={gloss}
            setGloss={setGloss}
            coroContour={coroContour}
            setCoroContour={setCoroContour}
            coroRush={coroRush}
            setCoroRush={setCoroRush}
            bannerType={bannerType}
            setBannerType={setBannerType}
            polePocket={polePocket}
            setPolePocket={setPolePocket}
            rope={rope}
            setRope={setRope}
            windSlits={windSlits}
            setWindSlits={setWindSlits}
            bannerRush={bannerRush}
            setBannerRush={setBannerRush}
            acmType={acmType}
            setAcmType={setAcmType}
            acmSqFtPrice={acmSqFtPrice}
            setAcmSqFtPrice={setAcmSqFtPrice}
            acmContour={acmContour}
            setAcmContour={setAcmContour}
            roundedCorners={roundedCorners}
            setRoundedCorners={setRoundedCorners}
            acrylicContour={acrylicContour}
            setAcrylicContour={setAcrylicContour}
            acrylicRoundedCorners={acrylicRoundedCorners}
            setAcrylicRoundedCorners={setAcrylicRoundedCorners}
            acrylicStandOffs={acrylicStandOffs}
            setAcrylicStandOffs={setAcrylicStandOffs}
            acrylicStandOffQty={acrylicStandOffQty}
            setAcrylicStandOffQty={setAcrylicStandOffQty}
            acrylicStandOffColor={acrylicStandOffColor}
            setAcrylicStandOffColor={setAcrylicStandOffColor}
            meshPolePocket={meshPolePocket}
            setMeshPolePocket={setMeshPolePocket}
            meshGrommets={meshGrommets}
            setMeshGrommets={setMeshGrommets}
            meshWelding={meshWelding}
            setMeshWelding={setMeshWelding}
            meshRope={meshRope}
            setMeshRope={setMeshRope}
            meshWebbing={meshWebbing}
            setMeshWebbing={setMeshWebbing}
            meshRush={meshRush}
            setMeshRush={setMeshRush}
            posterRush={posterRush}
            setPosterRush={setPosterRush}
            foamcoreDouble={foamcoreDouble}
            setFoamcoreDouble={setFoamcoreDouble}
            foamcoreContour={foamcoreContour}
            setFoamcoreContour={setFoamcoreContour}
            foamcoreGloss={foamcoreGloss}
            setFoamcoreGloss={setFoamcoreGloss}
            foamcoreRush={foamcoreRush}
            setFoamcoreRush={setFoamcoreRush}
            foamcoreCustomCut={foamcoreCustomCut}
            setFoamcoreCustomCut={setFoamcoreCustomCut}
            pvcType={pvcType}
            setPvcType={setPvcType}
            pvcContour={pvcContour}
            setPvcContour={setPvcContour}
            pvcRush={pvcRush}
            setPvcRush={setPvcRush}
            pvcCustomCut={pvcCustomCut}
            setPvcCustomCut={setPvcCustomCut}
            vehicleMagnetMode={vehicleMagnetMode}
            setVehicleMagnetMode={setVehicleMagnetMode}
            vehicleMagnetPreset={vehicleMagnetPreset}
            setVehicleMagnetPreset={setVehicleMagnetPreset}
            vehicleMagnetContour={vehicleMagnetContour}
            setVehicleMagnetContour={setVehicleMagnetContour}
            vehicleMagnetRoundedCorners={vehicleMagnetRoundedCorners}
            setVehicleMagnetRoundedCorners={setVehicleMagnetRoundedCorners}
            vehicleMagnetRush={vehicleMagnetRush}
            setVehicleMagnetRush={setVehicleMagnetRush}
            vehicleMagnetNotes={vehicleMagnetNotes}
            setVehicleMagnetNotes={setVehicleMagnetNotes}
            businessCardQty={businessCardQty}
            setBusinessCardQty={setBusinessCardQty}
            businessCardSides={businessCardSides}
            setBusinessCardSides={setBusinessCardSides}
            businessCardCoating={businessCardCoating}
            setBusinessCardCoating={setBusinessCardCoating}
            businessCardOrientation={businessCardOrientation}
            setBusinessCardOrientation={setBusinessCardOrientation}
            businessCardRush={businessCardRush}
            setBusinessCardRush={setBusinessCardRush}
            handheldPaperSizes={handheldPaperSizes}
            handheldPaperSize={handheldPaperSize}
            handheldPaperSizeKey={handheldPaperSizeKey}
            setHandheldPaperSizeKey={setHandheldPaperSizeKey}
            handheldPaperSides={handheldPaperSides}
            setHandheldPaperSides={setHandheldPaperSides}
            handheldPaperCoating={handheldPaperCoating}
            setHandheldPaperCoating={setHandheldPaperCoating}
            handheldPaperOrientation={handheldPaperOrientation}
            setHandheldPaperOrientation={setHandheldPaperOrientation}
            handheldPaperRush={handheldPaperRush}
            setHandheldPaperRush={setHandheldPaperRush}
            qty={qty}
            isAdminView={isAdminView}
          />


          {activeProduct !== "dtfTransfers" && activeProduct !== "screenPrinting" && (
            <div className="formGrid" style={grid}>
              {activeProduct !== "businessCards" && <Field label="Quantity" value={qty} setValue={setQty} />}
              {(activeProduct !== "vehicleMagnets" || vehicleMagnetMode === "custom") && !["businessCards", "handheld16ptPaper"].includes(activeProduct) && <Field label="Width Inches" value={width} setValue={setWidth} />}
              {(activeProduct !== "vehicleMagnets" || vehicleMagnetMode === "custom") && !["businessCards", "handheld16ptPaper"].includes(activeProduct) && <Field label="Height Inches" value={height} setValue={setHeight} />}
              {isAdminView && <Field label="Margin %" value={margin} setValue={setMargin} />}
              {showInternalFields && <Field label="Delivery / Install" value={delivery} setValue={setDelivery} />}
              {isAdminView && <Field label="Price Multiplier" value={multiplier} setValue={setMultiplier} />}
            </div>
          )}

          <button className="resetBtn" onClick={resetAll}>Reset to Defaults</button>

          {isAdminView && activeProduct !== "screenPrinting" && <Box title="Optional Fees">
            <Check label="Add Design Fee" value={useDesignFee} setValue={setUseDesignFee} />
            {useDesignFee && <Field label="Design Fee" value={designFee} setValue={setDesignFee} />}
            <Check label="Add Setup Fee" value={useSetupFee} setValue={setUseSetupFee} />
            {useSetupFee && <Field label="Setup Fee" value={setupFee} setValue={setSetupFee} />}
          </Box>}
        </section>

        <PricingSummary
          calc={calc}
          activeProduct={activeProduct}
          product={product}
          productMap={productMap}
          products={products}
          width={width}
          height={height}
          qty={qty}
          selectedDetails={selectedDetails}
          multiplier={multiplier}
          showBreakdown={showBreakdown}
          setShowBreakdown={setShowBreakdown}
          dtfSummary={dtfSummary}
          isAdminView={isAdminView}
        />
      </div>
    </main>
  );
}

const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, marginTop: 15 };
const visualLabel = { marginTop: 12, fontSize: 14, color: "#cbd5e1" };
const coroSign = { display: "inline-block", position: "relative", height: 120, width: 180 };

const signPanel = {
  background: "white",
  color: "#0f172a",
  borderRadius: 8,
  padding: "28px 10px",
  fontSize: 30,
  fontWeight: "bold",
  border: "4px solid #38bdf8",
};

const stakeLeft = { position: "absolute", left: 55, top: 80, width: 5, height: 55, background: "#94a3b8" };
const stakeRight = { position: "absolute", right: 55, top: 80, width: 5, height: 55, background: "#94a3b8" };

const bannerVisual = {
  display: "inline-block",
  background: "white",
  color: "#0f172a",
  borderRadius: 8,
  padding: "30px 45px",
  fontSize: 28,
  fontWeight: "bold",
  borderTop: "8px solid #38bdf8",
  borderBottom: "8px solid #38bdf8",
};

const vinylVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #ffffff, #dbeafe)",
  color: "#0f172a",
  borderRadius: 8,
  padding: "30px 45px",
  fontSize: 28,
  fontWeight: "bold",
  border: "4px dashed #38bdf8",
};


const posterVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #f8fafc, #cbd5e1)",
  color: "#0b1f4d",
  borderRadius: 10,
  padding: "28px 36px",
  fontSize: 30,
  fontWeight: "bold",
  border: "4px solid rgba(255,255,255,0.9)",
  boxShadow: "inset 0 0 16px rgba(0,0,0,.12)",
};

const acmVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #e5e7eb, #94a3b8)",
  color: "#0f172a",
  borderRadius: 10,
  padding: "35px 55px",
  fontSize: 34,
  fontWeight: "bold",
  border: "4px solid white",
  boxShadow: "inset 0 0 20px rgba(0,0,0,.2)",
};

const meshBannerVisual = {
  display: "inline-block",
  background: "repeating-linear-gradient(45deg, #dbeafe, #dbeafe 8px, #bfdbfe 8px, #bfdbfe 16px)",
  color: "#0f172a",
  borderRadius: 8,
  padding: "30px 45px",
  fontSize: 28,
  fontWeight: "bold",
  border: "4px solid #38bdf8",
};

const foamcoreVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #fef3c7, #fde68a)",
  color: "#422006",
  borderRadius: 10,
  padding: "32px 42px",
  fontSize: 28,
  fontWeight: "bold",
  border: "4px solid #f59e0b",
};

const acrylicVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, rgba(186,230,253,.8), rgba(224,242,254,.45))",
  color: "#0f172a",
  borderRadius: 10,
  padding: "34px 44px",
  fontSize: 30,
  fontWeight: "bold",
  border: "3px solid rgba(125,211,252,.9)",
  boxShadow: "inset 0 0 18px rgba(14,116,144,.18)",
};

const pvcVisual = {
  display: "inline-block",
  background: "linear-gradient(135deg, #ecfeff, #bae6fd)",
  color: "#082f49",
  borderRadius: 10,
  padding: "34px 44px",
  fontSize: 30,
  fontWeight: "bold",
  border: "3px solid #0ea5e9",
};
