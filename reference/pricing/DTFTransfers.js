"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Check, Field, input } from "../FormControls";

const DATA_PATH = "/data/SanMar_SDL_hue.csv";

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function toNumber(value) {
  const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function layoutTransfers(items, rollWidth, padding, allowRotate) {
  const usableItems = items
    .map((item) => {
      const baseW = toNumber(item.width);
      const baseH = toNumber(item.height);
      const rotatedW = baseH;
      const rotatedH = baseW;

      let width = baseW;
      let height = baseH;
      let rotated = false;

      if (allowRotate) {
        const fitsBase = baseW <= rollWidth;
        const fitsRotated = rotatedW <= rollWidth;

        if (!fitsBase && fitsRotated) {
          width = rotatedW;
          height = rotatedH;
          rotated = true;
        } else if (fitsBase && fitsRotated && rotatedH < baseH) {
          width = rotatedW;
          height = rotatedH;
          rotated = true;
        }
      }

      return {
        ...item,
        width,
        height,
        rotated,
      };
    })
    .filter((item) => item.width > 0 && item.height > 0 && item.width <= rollWidth)
    .sort((a, b) => b.height - a.height || b.width - a.width);

  const rows = [];
  for (const item of usableItems) {
    const footprintW = item.width + padding;
    const footprintH = item.height + padding;
    let placed = false;

    for (const row of rows) {
      if (row.usedWidth + footprintW <= rollWidth + 0.0001) {
        row.items.push({ ...item, x: row.usedWidth, y: row.y, footprintW, footprintH });
        row.usedWidth += footprintW;
        row.height = Math.max(row.height, footprintH);
        placed = true;
        break;
      }
    }

    if (!placed) {
      const y = rows.reduce((sum, row) => sum + row.height, 0);
      rows.push({
        y,
        height: footprintH,
        usedWidth: footprintW,
        items: [{ ...item, x: 0, y, footprintW, footprintH }],
      });
    }
  }

  const rollLengthUsed = rows.reduce((sum, row) => sum + row.height, 0);
  const placements = rows.flatMap((row) => row.items);
  const rotationUsed = placements.some((p) => p.rotated);

  return {
    placements,
    rows,
    rollWidth,
    rollLengthUsed,
    totalTransfers: placements.length,
    linearInches: rollLengthUsed,
    rotationUsed,
  };
}

function DtfRollPreview({ layout, padding }) {
  if (!layout.totalTransfers) {
    return <p style={{ margin: 0, opacity: 0.8 }}>Add transfers and quantity to generate a DTF roll preview.</p>;
  }

  const maxCanvasWidth = 700;
  const pxPerInch = Math.max(8, Math.min(20, maxCanvasWidth / layout.rollWidth));
  const canvasWidth = layout.rollWidth * pxPerInch;
  const canvasHeight = Math.max(120, layout.rollLengthUsed * pxPerInch);
  const colorMap = {
    front: "rgba(59,130,246,0.4)",
    back: "rgba(16,185,129,0.4)",
    leftSleeve: "rgba(250,204,21,0.4)",
    rightSleeve: "rgba(236,72,153,0.4)",
  };

  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 8, color: "#cbd5e1" }}>
        22&quot; roll width • {layout.rollLengthUsed.toFixed(2)}&quot; long • padding {padding.toFixed(2)}&quot;
      </div>
      <div style={{ maxWidth: "100%", overflowX: "auto", border: "2px solid #38bdf8", borderRadius: 10, padding: 6 }}>
        <div style={{ width: canvasWidth, height: canvasHeight, position: "relative", background: "rgba(15,23,42,0.7)" }}>
          {layout.placements.map((item, index) => (
            <div
              key={`${item.type}-${index}`}
              title={`${item.label}: ${item.width.toFixed(2)}\" × ${item.height.toFixed(2)}\"${item.rotated ? " (rotated)" : ""}`}
              style={{
                position: "absolute",
                left: item.x * pxPerInch,
                top: item.y * pxPerInch,
                width: item.width * pxPerInch,
                height: item.height * pxPerInch,
                border: "1px dashed #cbd5e1",
                background: colorMap[item.type] || "rgba(148,163,184,0.3)",
                color: "#f8fafc",
                fontSize: 10,
                lineHeight: 1.2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: 2,
                boxSizing: "border-box",
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DTFTransfers({ onSummaryChange, isAdminView = false }) {
  const DEFAULT_MARGIN_PERCENT = 60;
  const DTF_MATERIAL_COST_PER_LINEAR_INCH = 0.5;
  const DTF_MINIMUM_MATERIAL_CHARGE = 10;
  const DTF_SHIPPING_FLAT = 10;
  const DTF_SLEEVE_RETAIL_ADDON_EACH = 1;
  const QUICK_STYLES = [
    { code: "2000", label: "Gildan Tee 2000" },
    { code: "G2400", label: "Gildan Long Sleeve G2400" },
    { code: "BC3001", label: "Bella Tee BC3001" },
    { code: "996M", label: "Jerzees Tee 996M" },
    { code: "1717", label: "Comfort Colors 1717" },
    { code: "ST350", label: "Sport-Tek ST350" },
    { code: "ST350LS", label: "Sport-Tek LS ST350LS" },
  ];

  const FRONT_PRESETS = {
    "Left Chest": { width: 4, height: 4 },
    "Full Front": { width: 11, height: 10 },
  };
  const BACK_PRESETS = {
    "Full Back": { width: 12.5, height: 13 },
  };
  const DEFAULT_SLEEVE_SIZE = { width: 3.5, height: 3.5 };
  const SIZE_UPCHARGES = {
    qty2xl: 2.5,
    qty3xl: 3.5,
    qty4xl: 4.5,
    qty5xl: 5,
  };

  const [sanMarSearch, setSanMarSearch] = useState("");
  const [product, setProduct] = useState("Select product");
  const [color, setColor] = useState("Select color");
  const [frontPreset, setFrontPreset] = useState("None");
  const [backPreset, setBackPreset] = useState("None");
  const [frontWidth, setFrontWidth] = useState(11);
  const [frontHeight, setFrontHeight] = useState(10);
  const [backWidth, setBackWidth] = useState(12.5);
  const [backHeight, setBackHeight] = useState(13);
  const [leftSleeve, setLeftSleeve] = useState(false);
  const [rightSleeve, setRightSleeve] = useState(false);
  const [leftSleeveCustomSize, setLeftSleeveCustomSize] = useState(false);
  const [rightSleeveCustomSize, setRightSleeveCustomSize] = useState(false);
  const [leftSleeveWidth, setLeftSleeveWidth] = useState(DEFAULT_SLEEVE_SIZE.width);
  const [leftSleeveHeight, setLeftSleeveHeight] = useState(DEFAULT_SLEEVE_SIZE.height);
  const [rightSleeveWidth, setRightSleeveWidth] = useState(DEFAULT_SLEEVE_SIZE.width);
  const [rightSleeveHeight, setRightSleeveHeight] = useState(DEFAULT_SLEEVE_SIZE.height);
  const [padding, setPadding] = useState(0.25);
  const [dtfMode, setDtfMode] = useState("standard");
  const [bringYourOwnApparel, setBringYourOwnApparel] = useState(false);
  const [dtfOnlyWidth, setDtfOnlyWidth] = useState(11);
  const [dtfOnlyHeight, setDtfOnlyHeight] = useState(10);
  const [dtfOnlyQty, setDtfOnlyQty] = useState(1);
  const [optimizeLayout, setOptimizeLayout] = useState(true);
  const [qtyXs, setQtyXs] = useState(0);
  const [qtyS, setQtyS] = useState(0);
  const [qtyM, setQtyM] = useState(0);
  const [qtyL, setQtyL] = useState(0);
  const [qtyXl, setQtyXl] = useState(0);
  const [qty2xl, setQty2xl] = useState(0);
  const [qty3xl, setQty3xl] = useState(0);
  const [qty4xl, setQty4xl] = useState(0);
  const [qty5xl, setQty5xl] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [csvRows, setCsvRows] = useState([]);
  const [selectedStyleKey, setSelectedStyleKey] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [apparelCost, setApparelCost] = useState("");
  const [manualApparelCost, setManualApparelCost] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  const totalGarmentQty = useMemo(() => (
    dtfMode === "dtfOnly"
      ? Math.max(0, Math.floor(toNumber(dtfOnlyQty)))
      : (toNumber(qtyXs) + toNumber(qtyS) + toNumber(qtyM) + toNumber(qtyL) + toNumber(qtyXl)
      + toNumber(qty2xl) + toNumber(qty3xl) + toNumber(qty4xl) + toNumber(qty5xl))
  ), [dtfMode, dtfOnlyQty, qtyXs, qtyS, qtyM, qtyL, qtyXl, qty2xl, qty3xl, qty4xl, qty5xl]);

  const baseApparelCostUsed = useMemo(() => toNumber(apparelCost), [apparelCost]);

  const sizeUpchargeTotal = useMemo(() => (
    toNumber(qty2xl) * SIZE_UPCHARGES.qty2xl
    + toNumber(qty3xl) * SIZE_UPCHARGES.qty3xl
    + toNumber(qty4xl) * SIZE_UPCHARGES.qty4xl
    + toNumber(qty5xl) * SIZE_UPCHARGES.qty5xl
  ), [qty2xl, qty3xl, qty4xl, qty5xl]);

  const apparelDirectCost = useMemo(() => {
    if (dtfMode === "dtfOnly" || bringYourOwnApparel) return 0;
    return totalGarmentQty * baseApparelCostUsed;
  }, [dtfMode, bringYourOwnApparel, totalGarmentQty, baseApparelCostUsed]);

  const apparelCostWithMargin = useMemo(() => {
    const marginDecimal = DEFAULT_MARGIN_PERCENT / 100;
    if (marginDecimal >= 1) return 0;
    return apparelDirectCost / (1 - marginDecimal);
  }, [apparelDirectCost]);

  const apparelRetailSubtotal = useMemo(() => apparelCostWithMargin, [apparelCostWithMargin]);
  const byoaRetailFee = useMemo(() => (dtfMode === "standard" && bringYourOwnApparel ? 20 : 0), [dtfMode, bringYourOwnApparel]);

  const frontSelected = frontPreset !== "None";
  const backSelected = backPreset !== "None";

  const resolvedFrontSize = useMemo(() => {
    if (frontPreset === "Custom Size") {
      return { width: toNumber(frontWidth), height: toNumber(frontHeight) };
    }
    return FRONT_PRESETS[frontPreset] || null;
  }, [frontPreset, frontWidth, frontHeight]);

  const resolvedBackSize = useMemo(() => {
    if (backPreset === "Custom Size") {
      return { width: toNumber(backWidth), height: toNumber(backHeight) };
    }
    return BACK_PRESETS[backPreset] || null;
  }, [backPreset, backWidth, backHeight]);

  const resolvedLeftSleeveSize = leftSleeveCustomSize
    ? { width: toNumber(leftSleeveWidth), height: toNumber(leftSleeveHeight) }
    : DEFAULT_SLEEVE_SIZE;

  const resolvedRightSleeveSize = rightSleeveCustomSize
    ? { width: toNumber(rightSleeveWidth), height: toNumber(rightSleeveHeight) }
    : DEFAULT_SLEEVE_SIZE;

  const transferCountPerGarment = dtfMode === "dtfOnly"
    ? 1
    : (frontSelected ? 1 : 0)
    + (backSelected ? 1 : 0)
    + (leftSleeve ? 1 : 0)
    + (rightSleeve ? 1 : 0);

  const totalTransferCount = transferCountPerGarment * totalGarmentQty;
  const sleevePrintsPerGarment = (leftSleeve ? 1 : 0) + (rightSleeve ? 1 : 0);
  const sleeveRetailAddOnTotal = sleevePrintsPerGarment * totalGarmentQty * DTF_SLEEVE_RETAIL_ADDON_EACH;

  const dtfTransferItems = useMemo(() => {
    if (!totalGarmentQty) return [];
    const items = [];
    const repeat = Math.max(0, Math.floor(totalGarmentQty));
    const pushRepeated = (transfer) => {
      for (let i = 0; i < repeat; i += 1) items.push({ ...transfer, id: `${transfer.type}-${i}` });
    };

    if (dtfMode === "dtfOnly") {
      pushRepeated({ type: "dtfOnly", label: "DTF Transfer", width: toNumber(dtfOnlyWidth), height: toNumber(dtfOnlyHeight) });
      return items;
    }

    if (frontSelected && resolvedFrontSize) {
      pushRepeated({ type: "front", label: "Front", width: resolvedFrontSize.width, height: resolvedFrontSize.height });
    }
    if (backSelected && resolvedBackSize) {
      pushRepeated({ type: "back", label: "Back", width: resolvedBackSize.width, height: resolvedBackSize.height });
    }
    if (leftSleeve) {
      pushRepeated({ type: "leftSleeve", label: "Left Sleeve", width: resolvedLeftSleeveSize.width, height: resolvedLeftSleeveSize.height });
    }
    if (rightSleeve) {
      pushRepeated({ type: "rightSleeve", label: "Right Sleeve", width: resolvedRightSleeveSize.width, height: resolvedRightSleeveSize.height });
    }
    return items;
  }, [dtfMode, dtfOnlyWidth, dtfOnlyHeight, totalGarmentQty, frontSelected, backSelected, leftSleeve, rightSleeve, resolvedFrontSize, resolvedBackSize, resolvedLeftSleeveSize.width, resolvedLeftSleeveSize.height, resolvedRightSleeveSize.width, resolvedRightSleeveSize.height]);

  const dtfLayout = useMemo(() => {
    const rollWidth = 22;
    const safePadding = Math.max(0, toNumber(padding));
    const noRotation = layoutTransfers(dtfTransferItems, rollWidth, safePadding, false);
    const withRotation = layoutTransfers(dtfTransferItems, rollWidth, safePadding, true);
    if (!optimizeLayout) return noRotation;
    return withRotation.rollLengthUsed < noRotation.rollLengthUsed ? withRotation : noRotation;
  }, [dtfTransferItems, padding, optimizeLayout]);

  const dtfWasteSummary = useMemo(() => {
    const runArea = dtfLayout.rollWidth * dtfLayout.rollLengthUsed;
    const usedTransferArea = dtfLayout.placements.reduce((sum, item) => sum + (item.width * item.height), 0);
    const unusedArea = Math.max(0, runArea - usedTransferArea);
    const unusedPercent = runArea > 0 ? (unusedArea / runArea) * 100 : 0;
    return { runArea, usedTransferArea, unusedArea, unusedPercent };
  }, [dtfLayout]);

  const dtfMaterialCost = useMemo(() => (
    Math.max(dtfLayout.linearInches * DTF_MATERIAL_COST_PER_LINEAR_INCH, DTF_MINIMUM_MATERIAL_CHARGE)
  ), [dtfLayout.linearInches]);

  const dtfRetailSubtotal = useMemo(() => {
    const marginDecimal = DEFAULT_MARGIN_PERCENT / 100;
    if (marginDecimal >= 1) return 0;
    return dtfMaterialCost / (1 - marginDecimal);
  }, [dtfMaterialCost]);

  const directCost = useMemo(() => apparelDirectCost + dtfMaterialCost + DTF_SHIPPING_FLAT, [apparelDirectCost, dtfMaterialCost]);

  const finalRetail = useMemo(() => (
    apparelRetailSubtotal + dtfRetailSubtotal + sizeUpchargeTotal + sleeveRetailAddOnTotal + DTF_SHIPPING_FLAT + byoaRetailFee
  ), [apparelRetailSubtotal, dtfRetailSubtotal, sizeUpchargeTotal, sleeveRetailAddOnTotal, byoaRetailFee]);

  const pricePerGarment = useMemo(() => (totalGarmentQty > 0 ? finalRetail / totalGarmentQty : 0), [finalRetail, totalGarmentQty]);

  useEffect(() => {
    if (!onSummaryChange) return;
    onSummaryChange({
      label: dtfMode === "dtfOnly" ? "DTF Transfers Only" : "DTF Transfers",
      retail: finalRetail,
      each: pricePerGarment,
      cost: directCost,
      profit: finalRetail - directCost,
      margin: finalRetail ? ((finalRetail - directCost) / finalRetail) * 100 : 0,
      materialCost: apparelDirectCost + dtfMaterialCost,
      shipping: DTF_SHIPPING_FLAT,
      apparelDirectCost,
      apparelRetailSubtotal,
      byoaRetailFee,
      dtfMode,
      bringYourOwnApparel,
      dtfOnlyWidth: toNumber(dtfOnlyWidth),
      dtfOnlyHeight: toNumber(dtfOnlyHeight),
      dtfOnlyQty: Math.max(0, Math.floor(toNumber(dtfOnlyQty))),
      dtfMaterialCost,
      dtfRetailSubtotal,
      sizeUpchargeTotal,
      sleeveRetailAddOnTotal,
      directCost,
      finalRetail,
      pricePerGarment,
      productDisplay: selectedProduct ? `${selectedProduct.style} — ${selectedProduct.title} (${selectedProduct.color})` : "No SanMar item selected",
      selectedStyle: selectedProduct?.style || "",
      selectedTitle: selectedProduct?.title || "",
      selectedColor: selectedProduct?.color || "",
      sizeQuantities: {
        XS: toNumber(qtyXs),
        S: toNumber(qtyS),
        M: toNumber(qtyM),
        L: toNumber(qtyL),
        XL: toNumber(qtyXl),
        "2XL": toNumber(qty2xl),
        "3XL": toNumber(qty3xl),
        "4XL": toNumber(qty4xl),
        "5XL": toNumber(qty5xl),
      },
      apparelCostUsed: baseApparelCostUsed,
      totalGarmentQty,
      selectedPrintLocations: [
        frontSelected ? `Front ${resolvedFrontSize ? `(${resolvedFrontSize.width}" x ${resolvedFrontSize.height}")` : ""}` : null,
        backSelected ? `Back ${resolvedBackSize ? `(${resolvedBackSize.width}" x ${resolvedBackSize.height}")` : ""}` : null,
        leftSleeve ? `Left Sleeve (${resolvedLeftSleeveSize.width}" x ${resolvedLeftSleeveSize.height}")` : null,
        rightSleeve ? `Right Sleeve (${resolvedRightSleeveSize.width}" x ${resolvedRightSleeveSize.height}")` : null,
      ].filter(Boolean),
      rollLengthUsed: dtfLayout.rollLengthUsed,
      transferCount: totalTransferCount,
    });
  }, [onSummaryChange, dtfMode, bringYourOwnApparel, dtfOnlyWidth, dtfOnlyHeight, dtfOnlyQty, byoaRetailFee, finalRetail, pricePerGarment, directCost, apparelDirectCost, dtfMaterialCost, DTF_SHIPPING_FLAT, apparelRetailSubtotal, dtfRetailSubtotal, sizeUpchargeTotal, sleeveRetailAddOnTotal, selectedProduct, baseApparelCostUsed, totalGarmentQty, frontSelected, resolvedFrontSize, backSelected, resolvedBackSize, leftSleeve, resolvedLeftSleeveSize, rightSleeve, resolvedRightSleeveSize, dtfLayout.rollLengthUsed, totalTransferCount, qtyXs, qtyS, qtyM, qtyL, qtyXl, qty2xl, qty3xl, qty4xl, qty5xl]);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;

    let mounted = true;
    loadedRef.current = true;
    setLoading(true);
    fetch(DATA_PATH)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load CSV (${response.status})`);
        return response.text();
      })
      .then((text) => {
        if (!mounted) return;
        const lines = text.split(/\r?\n/).filter((line) => line.trim());
        if (!lines.length) {
          setCsvRows([]);
          return;
        }

        const headers = parseCsvLine(lines[0]);
        const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));

        const parsed = lines.slice(1).map((line) => parseCsvLine(line)).map((cols) => ({
          style: cols[headerIndex["STYLE#"]] || "",
          title: cols[headerIndex.PRODUCT_TITLE] || "",
          color: cols[headerIndex.COLOR_NAME] || "",
          size: cols[headerIndex.SIZE] || "",
          casePriceRaw: cols[headerIndex.CASE_PRICE] || "",
          casePrice: toNumber(cols[headerIndex.CASE_PRICE]),
          caseSize: cols[headerIndex.CASE_SIZE] || "",
        })).filter((row) => row.style && row.title);

        setCsvRows(parsed);
      })
      .catch((error) => {
        if (!mounted) return;
        setLoadError(error.message || "Failed to load CSV");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const stylesByKey = useMemo(() => {
    const map = new Map();
    for (const row of csvRows) {
      const key = `${row.style}__${row.title}`;
      if (!map.has(key)) {
        map.set(key, { key, style: row.style, title: row.title, rows: [] });
      }
      map.get(key).rows.push(row);
    }
    return map;
  }, [csvRows]);

  const filteredStyles = useMemo(() => {
    const term = sanMarSearch.trim().toLowerCase();
    if (!term) return [];
    const matches = [];
    for (const styleGroup of stylesByKey.values()) {
      const haystack = `${styleGroup.style} ${styleGroup.title}`.toLowerCase();
      if (haystack.includes(term)) {
        matches.push(styleGroup);
      }
    }
    return matches.slice(0, 50);
  }, [sanMarSearch, stylesByKey]);

  const selectedStyle = selectedStyleKey ? stylesByKey.get(selectedStyleKey) : null;

  const availableColors = useMemo(() => {
    if (!selectedStyle) return [];
    return [...new Set(selectedStyle.rows.map((row) => row.color).filter(Boolean))].sort();
  }, [selectedStyle]);

  useEffect(() => {
    if (!selectedStyle || color === "Select color") return;
    const matched = selectedStyle.rows.find((row) => row.color === color) || null;
    setSelectedProduct(matched);
    if (matched && !manualApparelCost) {
      setApparelCost(String(matched.casePrice));
    }
    if (matched) {
      setSanMarSearch("");
    }
  }, [selectedStyle, color, manualApparelCost]);

  function handleStyleSelect(styleKey) {
    const styleGroup = stylesByKey.get(styleKey);
    setSelectedStyleKey(styleKey);
    setProduct(styleGroup ? `${styleGroup.style} — ${styleGroup.title}` : "Select product");
    setColor("Select color");
    setSelectedProduct(null);
  }

  function pickDefaultColor(colors) {
    if (!colors.length) return "Select color";

    const exactBlack = colors.find((colorName) => colorName.trim().toLowerCase() === "black");
    if (exactBlack) return exactBlack;

    const closeBlack = colors.find((colorName) => colorName.toLowerCase().includes("black"));
    if (closeBlack) return closeBlack;

    return colors[0];
  }

  function handleQuickStyleSelect(styleCode) {
    const normalizedCode = styleCode.trim().toLowerCase();
    const matchedStyle = [...stylesByKey.values()].find((styleGroup) => styleGroup.style.trim().toLowerCase() === normalizedCode);

    if (!matchedStyle) {
      setSanMarSearch(styleCode);
      return;
    }

    setSanMarSearch(styleCode);
    setManualApparelCost(false);
    setSelectedStyleKey(matchedStyle.key);
    setProduct(`${matchedStyle.style} — ${matchedStyle.title}`);

    const colors = [...new Set(matchedStyle.rows.map((row) => row.color).filter(Boolean))].sort();
    const preferredColor = pickDefaultColor(colors);

    setColor(preferredColor);
    setFrontPreset("Left Chest");
    setBackPreset("Full Back");
    setQtyXs(0);
    setQtyS(0);
    setQtyM(1);
    setQtyL(0);
    setQtyXl(0);
    setQty2xl(0);
    setQty3xl(0);
    setQty4xl(0);
    setQty5xl(0);
  }

  function handleManualApparelCostChange(value) {
    setManualApparelCost(value !== "");
    setApparelCost(value);
  }

  async function handleCopyQuote() {
    const selectedLocations = [
      frontSelected ? `Front${resolvedFrontSize ? ` (${resolvedFrontSize.width}" x ${resolvedFrontSize.height}")` : ""}` : null,
      backSelected ? `Back${resolvedBackSize ? ` (${resolvedBackSize.width}" x ${resolvedBackSize.height}")` : ""}` : null,
      leftSleeve ? `Left Sleeve (${resolvedLeftSleeveSize.width}" x ${resolvedLeftSleeveSize.height}")` : null,
      rightSleeve ? `Right Sleeve (${resolvedRightSleeveSize.width}" x ${resolvedRightSleeveSize.height}")` : null,
    ].filter(Boolean);

    const quoteLines = [
      "DTF Transfers Quote",
      `SanMar Product: ${selectedProduct ? `${selectedProduct.style} — ${selectedProduct.title}` : "Not selected"}`,
      `Color: ${selectedProduct?.color || color || "Not selected"}`,
      `Garment Quantity: ${totalGarmentQty}`,
      `Print Locations: ${selectedLocations.length ? selectedLocations.join(", ") : "None selected"}`,
      `Total Price: $${finalRetail.toFixed(2)}`,
      `Price Per Garment: $${pricePerGarment.toFixed(2)}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(quoteLines);
      setCopyStatus("Quote copied");
    } catch (error) {
      setCopyStatus("Unable to copy quote");
    }
    setTimeout(() => setCopyStatus(""), 2500);
  }

  return (
    <>
      <Box title="DTF Transfers Product Setup">
        <div style={{ marginBottom: 15 }}>
          <label>DTF Mode</label>
          <select style={input} value={dtfMode} onChange={(e) => setDtfMode(e.target.value)}>
            <option value="standard">Standard Apparel + DTF</option>
            <option value="dtfOnly">DTF Only</option>
          </select>
          {dtfMode === "standard" && <Check label="Bring Your Own Apparel" value={bringYourOwnApparel} setValue={setBringYourOwnApparel} />}
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", marginBottom: 8 }}>Quick Styles</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QUICK_STYLES.map((styleOption) => (
              <button
                key={styleOption.code}
                type="button"
                className={`presetBtn ${selectedProduct?.style === styleOption.code || (selectedStyle && selectedStyle.style === styleOption.code) ? "activePreset" : ""}`}
                onClick={() => handleQuickStyleSelect(styleOption.code)}
                style={{ minWidth: 84, padding: "10px 12px" }}
              >
                {styleOption.label}
              </button>
            ))}
          </div>
        </div>

        {dtfMode === "standard" && !bringYourOwnApparel && <><label>SanMar Style Search</label>
        <input
          style={input}
          value={sanMarSearch}
          onChange={(e) => setSanMarSearch(e.target.value)}
          placeholder="Search by STYLE# or product title"
        />
        {loading && <p style={{ margin: "8px 0 0", fontSize: 14, opacity: 0.8 }}>Loading SanMar catalog…</p>}
        {!loading && sanMarSearch && filteredStyles.length === 0 && !loadError && (
          <p style={{ margin: "8px 0 0", fontSize: 14, opacity: 0.8 }}>No results found.</p>
        )}
        {loadError && <p style={{ margin: "8px 0 0", fontSize: 14, color: "#b91c1c" }}>{loadError}</p>}

        {!loading && sanMarSearch && filteredStyles.length > 0 && (
          <div style={{ marginTop: 10, border: "1px solid #64748b", borderRadius: 10, maxHeight: 220, overflowY: "auto", background: "rgba(15,23,42,0.92)", color: "#e5e7eb" }}>
            {filteredStyles.map((styleGroup) => (
              <button
                key={styleGroup.key}
                type="button"
                onClick={() => handleStyleSelect(styleGroup.key)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: selectedStyleKey === styleGroup.key ? "rgba(59,130,246,0.22)" : "transparent",
                  color: "inherit",
                  padding: 10,
                  cursor: "pointer",
                }}
              >
                <strong>{styleGroup.style}</strong> — {styleGroup.title}
              </button>
            ))}
          </div>
        )}

        <div className="formGrid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 15, marginTop: 15 }}>
          <div>
            <label>Product</label>
            <select style={input} value={product} onChange={(e) => setProduct(e.target.value)}><option>{product}</option></select>
          </div>
          <div>
            <label>Color</label>
            <select style={input} value={color} onChange={(e) => setColor(e.target.value)}>
              <option>Select color</option>
              {availableColors.map((colorName) => <option key={colorName}>{colorName}</option>)}
            </select>
          </div>
        </div>

        </>}

        {isAdminView && dtfMode !== "dtfOnly" && !bringYourOwnApparel && <div style={{ marginTop: 15 }}>
          <label>Apparel Cost (manual override supported)</label>
          <input style={input} type="number" step="0.01" value={apparelCost} onChange={(e) => handleManualApparelCostChange(e.target.value)} placeholder="Auto-filled from CASE_PRICE" />
        </div>}

        {dtfMode === "dtfOnly" ? (
          <div className="formGrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 15, marginTop: 15 }}>
            <Field label="DTF Width (in)" value={dtfOnlyWidth} setValue={setDtfOnlyWidth} />
            <Field label="DTF Height (in)" value={dtfOnlyHeight} setValue={setDtfOnlyHeight} />
            <Field label="DTF Quantity" value={dtfOnlyQty} setValue={setDtfOnlyQty} />
          </div>
        ) : (
        <>
        <div className="formGrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, marginTop: 15 }}>
          <div>
            <label>Front Print Preset</label>
            <select style={input} value={frontPreset} onChange={(e) => setFrontPreset(e.target.value)}>
              <option>None</option>
              <option>Left Chest</option>
              <option>Full Front</option>
              <option>Custom Size</option>
            </select>
          </div>
          {frontPreset === "Custom Size" && (
            <>
              <Field label="Front Width (in)" value={frontWidth} setValue={setFrontWidth} />
              <Field label="Front Height (in)" value={frontHeight} setValue={setFrontHeight} />
            </>
          )}
          <div>
            <label>Back Print Preset</label>
            <select style={input} value={backPreset} onChange={(e) => setBackPreset(e.target.value)}>
              <option>None</option>
              <option>Full Back</option>
              <option>Custom Size</option>
            </select>
          </div>
          {backPreset === "Custom Size" && (
            <>
              <Field label="Back Width (in)" value={backWidth} setValue={setBackWidth} />
              <Field label="Back Height (in)" value={backHeight} setValue={setBackHeight} />
            </>
          )}
        </div>

        <Check label="Left Sleeve Print" value={leftSleeve} setValue={setLeftSleeve} />
        {leftSleeve && (
          <>
            <Check label="Custom Left Sleeve Size" value={leftSleeveCustomSize} setValue={setLeftSleeveCustomSize} />
            {leftSleeveCustomSize && (
              <div className="formGrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
                <Field label="Left Sleeve Width (in)" value={leftSleeveWidth} setValue={setLeftSleeveWidth} />
                <Field label="Left Sleeve Height (in)" value={leftSleeveHeight} setValue={setLeftSleeveHeight} />
              </div>
            )}
          </>
        )}
        <Check label="Right Sleeve Print" value={rightSleeve} setValue={setRightSleeve} />
        {rightSleeve && (
          <>
            <Check label="Custom Right Sleeve Size" value={rightSleeveCustomSize} setValue={setRightSleeveCustomSize} />
            {rightSleeveCustomSize && (
              <div className="formGrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
                <Field label="Right Sleeve Width (in)" value={rightSleeveWidth} setValue={setRightSleeveWidth} />
                <Field label="Right Sleeve Height (in)" value={rightSleeveHeight} setValue={setRightSleeveHeight} />
              </div>
            )}
          </>
        )}
        </>)}
        {isAdminView ? (
          <Field label="Padding (inches)" value={padding} setValue={setPadding} />
        ) : (
          <p style={{ margin: "8px 0 12px", opacity: 0.9 }}><strong>Production spacing/padding:</strong> {Math.max(0, toNumber(padding)).toFixed(2)} inch</p>
        )}
        <Check label="Optimize Layout" value={optimizeLayout} setValue={setOptimizeLayout} />
      </Box>

      {dtfMode === "standard" && !bringYourOwnApparel && <Box title="Selected SanMar Product">
        {!selectedProduct && <p style={{ margin: 0, opacity: 0.8 }}>Select style and color to load SanMar product details.</p>}
        {selectedProduct && (
          <div style={{ display: "grid", gap: 6 }}>
            <div><strong>Style #:</strong> {selectedProduct.style}</div>
            <div><strong>Product:</strong> {selectedProduct.title}</div>
            <div><strong>Color:</strong> {selectedProduct.color}</div>
            {isAdminView && <div><strong>Case Price:</strong> {selectedProduct.casePriceRaw || "N/A"}</div>}
            <div><strong>Case Size:</strong> {selectedProduct.caseSize || "N/A"}</div>
          </div>
        )}
      </Box>}

      {dtfMode !== "dtfOnly" && <Box title="Apparel Quantities">
        <div className="formGrid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))", gap: 10 }}>
          <Field label="XS" value={qtyXs} setValue={setQtyXs} />
          <Field label="S" value={qtyS} setValue={setQtyS} />
          <Field label="M" value={qtyM} setValue={setQtyM} />
          <Field label="L" value={qtyL} setValue={setQtyL} />
          <Field label="XL" value={qtyXl} setValue={setQtyXl} />
          <Field label="2XL" value={qty2xl} setValue={setQty2xl} />
          <Field label="3XL" value={qty3xl} setValue={setQty3xl} />
          <Field label="4XL" value={qty4xl} setValue={setQty4xl} />
          <Field label="5XL" value={qty5xl} setValue={setQty5xl} />
        </div>
      </Box>}

      <Box title="DTF Roll Layout Preview"><DtfRollPreview layout={dtfLayout} padding={Math.max(0, toNumber(padding))} /></Box>
      <Box title={isAdminView ? "DTF Pricing Summary" : "DTF Customer Quote Summary"}>
        {!isAdminView ? (
          <div style={{ display: "grid", gap: 6 }}>
            <div><strong>Product:</strong> DTF Transfers</div>
            <div><strong>Style #:</strong> {selectedProduct?.style || "Not selected"}</div>
            <div><strong>Garment:</strong> {selectedProduct?.title || "Not selected"}</div>
            <div><strong>Color:</strong> {selectedProduct?.color || "Not selected"}</div>
            <div><strong>Total garment quantity:</strong> {totalGarmentQty}</div>
            <div><strong>Size quantities:</strong> {Object.entries({
              XS: toNumber(qtyXs),
              S: toNumber(qtyS),
              M: toNumber(qtyM),
              L: toNumber(qtyL),
              XL: toNumber(qtyXl),
              "2XL": toNumber(qty2xl),
              "3XL": toNumber(qty3xl),
              "4XL": toNumber(qty4xl),
              "5XL": toNumber(qty5xl),
            }).filter(([, value]) => value > 0).map(([size, value]) => `${size}(${value})`).join(", ") || "None"}</div>
            <div><strong>Front print:</strong> {frontSelected ? `${frontPreset}${resolvedFrontSize ? ` (${resolvedFrontSize.width}" x ${resolvedFrontSize.height}")` : ""}` : "None"}</div>
            <div><strong>Back print:</strong> {backSelected ? `${backPreset}${resolvedBackSize ? ` (${resolvedBackSize.width}" x ${resolvedBackSize.height}")` : ""}` : "None"}</div>
            <div><strong>Left sleeve:</strong> {leftSleeve ? `Selected (${resolvedLeftSleeveSize.width}" x ${resolvedLeftSleeveSize.height}")` : "None"}</div>
            <div><strong>Right sleeve:</strong> {rightSleeve ? `Selected (${resolvedRightSleeveSize.width}" x ${resolvedRightSleeveSize.height}")` : "None"}</div>
            <div><strong>Price per garment:</strong> ${pricePerGarment.toFixed(2)}</div>
            <div><strong>Final total:</strong> ${finalRetail.toFixed(2)}</div>
          </div>
        ) : (
        <>
        <div style={{ display: "grid", gap: 6 }}>
          <div><strong>Base apparel cost used:</strong> ${baseApparelCostUsed.toFixed(2)} {manualApparelCost ? "(manual override)" : "(SanMar CASE_PRICE)"}</div>
          <div><strong>Total garment quantity:</strong> {totalGarmentQty}</div>
          <div><strong>Apparel direct cost:</strong> ${apparelDirectCost.toFixed(2)}</div>
          <div><strong>Apparel retail subtotal:</strong> ${apparelRetailSubtotal.toFixed(2)}</div>
          <div><strong>DTF material cost:</strong> ${dtfMaterialCost.toFixed(2)}</div>
          <div><strong>DTF retail subtotal:</strong> ${dtfRetailSubtotal.toFixed(2)}</div>
          <div><strong>Size upcharge total:</strong> ${sizeUpchargeTotal.toFixed(2)}</div>
          <div><strong>Sleeve retail add-on total:</strong> ${sleeveRetailAddOnTotal.toFixed(2)}</div>
          <div><strong>Shipping (pass-through):</strong> ${DTF_SHIPPING_FLAT.toFixed(2)}</div>
          <div><strong>Direct cost:</strong> ${directCost.toFixed(2)}</div>
          <div><strong>Final retail:</strong> ${finalRetail.toFixed(2)}</div>
          <div><strong>Price per garment:</strong> ${pricePerGarment.toFixed(2)}</div>
          <div><strong>Front print:</strong> {frontPreset}{resolvedFrontSize ? ` (${resolvedFrontSize.width}\" x ${resolvedFrontSize.height}\")` : ""}</div>
          <div><strong>Back print:</strong> {backPreset}{resolvedBackSize ? ` (${resolvedBackSize.width}\" x ${resolvedBackSize.height}\")` : ""}</div>
          <div><strong>Left sleeve:</strong> {leftSleeve ? `Selected (${resolvedLeftSleeveSize.width}\" x ${resolvedLeftSleeveSize.height}\")` : "None"}</div>
          <div><strong>Right sleeve:</strong> {rightSleeve ? `Selected (${resolvedRightSleeveSize.width}\" x ${resolvedRightSleeveSize.height}\")` : "None"}</div>
          <div><strong>Transfer padding:</strong> {toNumber(padding)}"</div>
          <div><strong>Total transfer count:</strong> {totalTransferCount}</div>
          <div><strong>Roll width:</strong> {dtfLayout.rollWidth}"</div>
          <div><strong>Roll length used:</strong> {dtfLayout.rollLengthUsed.toFixed(2)}"</div>
          <div><strong>Estimated unused area:</strong> {dtfWasteSummary.unusedArea.toFixed(2)} sq in</div>
          <div><strong>Unused roll space:</strong> {dtfWasteSummary.unusedPercent.toFixed(1)}%</div>
          {dtfLayout.totalTransfers > 0 && dtfWasteSummary.unusedPercent >= 10 && (
            <div style={{ color: "#bfdbfe" }}>You may be able to fit more transfers in this run.</div>
          )}
          <div><strong>Rotation used:</strong> {dtfLayout.rotationUsed ? "Yes" : "No"}</div>
          <div><strong>Layout optimization:</strong> {optimizeLayout ? "Enabled (auto-rotation allowed)" : "Disabled (no rotation)"}</div>
          <div><strong>Estimated linear inches:</strong> {dtfLayout.linearInches.toFixed(2)}"</div>
          <div><strong>Material formula:</strong> {dtfLayout.linearInches.toFixed(2)} × ${DTF_MATERIAL_COST_PER_LINEAR_INCH.toFixed(2)} (min ${DTF_MINIMUM_MATERIAL_CHARGE.toFixed(2)})</div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="modeBtn" onClick={handleCopyQuote}>Copy Quote</button>
          {copyStatus && <span style={{ marginLeft: 10, fontSize: 13, color: "#bfdbfe" }}>{copyStatus}</span>}
        </div>
        </>
        )}
      </Box>
    </>
  );
}
