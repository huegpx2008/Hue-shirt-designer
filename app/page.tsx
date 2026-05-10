'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ActiveSelection, Canvas, FabricImage, IText, Object as FabricObject } from 'fabric';
import TshirtShape from '@/components/tshirt-shape';
import { PRINT_AREA_CONFIG, ProductCatalogItem, PrintLocation, SAMPLE_PRODUCT_CATALOG } from '@/components/product-catalog';
import { calculateDtfPricing } from '@/lib/pricing/dtf-pricing';
import { recommendPrintMethodByCost } from '@/lib/pricing/recommend-print-method';
import { calculateScreenPrintPricing } from '@/lib/pricing/screen-print-pricing';
import generatedSanMarCatalog from '@/public/data/sanmar-catalog.sample.generated.json';
import fallbackSanMarPreview from '@/public/data/catalog-preview-25.json';

type ShirtView = 'front' | 'back';
type FontOption = { label: string; value: string };
type LayerItem = { id: string; name: string; type: string; isActive: boolean };
type ImageType = 'flat' | 'model';
type SanMarPreviewItem = { styleNumber: string; productName: string; brand: string; category?: string; colorName: string; availableSizes: string[]; frontModelImageUrl?: string; backModelImageUrl?: string; frontFlatImageUrl?: string; backFlatImageUrl?: string; productImageUrl?: string; colorSwatchImageUrl?: string };
type SizeKey = 'YS' | 'YM' | 'YL' | 'YXL' | 'AS' | 'AM' | 'AL' | 'AXL' | '2XL' | '3XL' | '4XL';
type CustomerInfo = {
  name: string;
  organization: string;
  email: string;
  phone: string;
  neededByDate: string;
  notes: string;
};

const FONT_OPTIONS: FontOption[] = [
  { label: 'Inter', value: 'Inter, Arial, sans-serif' },
  { label: 'Poppins', value: 'Poppins, Arial, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' }
];

const SIZE_FIELDS: SizeKey[] = ['YS', 'YM', 'YL', 'YXL', 'AS', 'AM', 'AL', 'AXL', '2XL', '3XL', '4XL'];

const COLOR_MAP: Record<string, string> = { white: '#ffffff', black: '#111111', ash: '#d1d5db', navy: '#1f365f', 'true red': '#b91c1c', 'forest green': '#166534' };

const swapImageToken = (url: string, nextType: ImageType, nextView: ShirtView) => {
  const typeToken = nextType === 'flat' ? 'flat' : 'model';
  const viewToken = nextView === 'front' ? 'front' : 'back';
  let nextUrl = url;
  nextUrl = nextUrl.replace(/_(model|flat)_/i, `_${typeToken}_`);
  nextUrl = nextUrl.replace(/_(front|back)\./i, `_${viewToken}.`);
  return nextUrl;
};

const getImageCandidates = (item: SanMarPreviewItem | undefined, type: ImageType, view: ShirtView) => {
  if (!item) return [];
  const direct = type === 'flat'
    ? (view === 'front' ? item.frontFlatImageUrl : item.backFlatImageUrl)
    : (view === 'front' ? item.frontModelImageUrl : item.backModelImageUrl);
  const oppositeView = type === 'flat'
    ? (view === 'front' ? item.backFlatImageUrl : item.frontFlatImageUrl)
    : (view === 'front' ? item.backModelImageUrl : item.frontModelImageUrl);
  const fallbackTypePrimary = type === 'flat'
    ? (view === 'front' ? item.frontModelImageUrl : item.backModelImageUrl)
    : (view === 'front' ? item.frontFlatImageUrl : item.backFlatImageUrl);
  const tokenSource = direct || fallbackTypePrimary || item.productImageUrl;
  const tokenCandidates = tokenSource ? [
    swapImageToken(tokenSource, type, view),
    swapImageToken(tokenSource, type === 'flat' ? 'model' : 'flat', view),
    swapImageToken(tokenSource, type, view === 'front' ? 'back' : 'front')
  ] : [];
  return Array.from(new Set([direct, oppositeView, fallbackTypePrimary, item.productImageUrl, item.productImageUrl, ...tokenCandidates].filter(Boolean) as string[]));
};

export default function Home() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const [selectedProductId, setSelectedProductId] = useState(SAMPLE_PRODUCT_CATALOG[0].id);
  const selectedProduct = useMemo<ProductCatalogItem>(() => SAMPLE_PRODUCT_CATALOG.find((item) => item.id === selectedProductId) || SAMPLE_PRODUCT_CATALOG[0], [selectedProductId]);
  const [shirtColor, setShirtColor] = useState(selectedProduct.availableColors[0].value);
  const [shirtView, setShirtView] = useState<ShirtView>('front');
  const [printLocation, setPrintLocation] = useState<PrintLocation>(SAMPLE_PRODUCT_CATALOG[0].defaultPrintLocations[0]);
  const [textValue, setTextValue] = useState('Your text');
  const [activeObject, setActiveObject] = useState<FabricObject | null>(null);
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value);
  const [fontSize, setFontSize] = useState(30);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [textColor, setTextColor] = useState('#111827');
  const [zoom, setZoom] = useState(1);
  const [layers, setLayers] = useState<LayerItem[]>([]);
  // NOTE: Full SanMar catalog generation should happen outside Codex or via a DB/API to avoid huge git diffs.
  const previewCatalog = useMemo<SanMarPreviewItem[]>(() => {
    const generated = (generatedSanMarCatalog as SanMarPreviewItem[]);
    return generated.length > 0 ? generated : (fallbackSanMarPreview as unknown as SanMarPreviewItem[]);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPreviewId, setSelectedPreviewId] = useState(0);
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const hasActiveCatalogFilters = searchQuery.trim().length > 0 || brandFilter !== 'all' || categoryFilter !== 'all';
  const [imageType, setImageType] = useState<ImageType>('flat');
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(null);
  const [imageFallbackUsed, setImageFallbackUsed] = useState(false);
  const [sizeQuantities, setSizeQuantities] = useState<Record<SizeKey, number>>({
    YS: 0, YM: 0, YL: 0, YXL: 0, AS: 0, AM: 0, AL: 0, AXL: 0, '2XL': 0, '3XL': 0, '4XL': 0
  });
  const [printMethod, setPrintMethod] = useState('Not sure / Recommend for me');
  const [imageComplexity, setImageComplexity] = useState('Simple 1 color');
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({ name: '', organization: '', email: '', phone: '', neededByDate: '', notes: '' });
  const [capturedDesignPreview, setCapturedDesignPreview] = useState<string | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const designArea = useMemo(() => PRINT_AREA_CONFIG[printLocation], [printLocation]);
  const selectedPreview = previewCatalog[selectedPreviewId];
  const groupedStyles = useMemo(() => {
    const groups = new Map<string, SanMarPreviewItem[]>();
    previewCatalog.forEach((item) => {
      const key = item.styleNumber;
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    });

    return Array.from(groups.entries()).map(([styleNumber, items]) => ({
      styleNumber,
      items,
      name: items[0]?.productName || '',
      brand: items[0]?.brand || '',
      category: items[0]?.category || ''
    }));
  }, [previewCatalog]);

  const totalSampleRowsLoaded = previewCatalog.length;
  const totalUniqueStyles = groupedStyles.length;

  const filteredPreviewCatalog = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return groupedStyles.filter((group) => {
      if (brandFilter !== 'all' && group.brand !== brandFilter) return false;
      if (categoryFilter !== 'all' && group.category !== categoryFilter) return false;
      if (!query) return true;

      const groupMatch = [group.styleNumber, group.name, group.brand, group.category]
        .some((value) => value.toLowerCase().includes(query));
      if (groupMatch) return true;

      return group.items.some((item) => [item.styleNumber, item.productName, item.brand, item.category || '', item.colorName, item.productImageUrl || '', item.frontModelImageUrl || '', item.backModelImageUrl || '', item.frontFlatImageUrl || '', item.backFlatImageUrl || '', item.productImageUrl || '']
        .some((value) => value.toLowerCase().includes(query)));
    });
  }, [brandFilter, categoryFilter, groupedStyles, searchQuery]);

  const brandOptions = useMemo(() => Array.from(new Set(groupedStyles.map((group) => group.brand).filter(Boolean))).sort(), [groupedStyles]);
  const categoryOptions = useMemo(() => Array.from(new Set(groupedStyles.map((group) => group.category).filter(Boolean))).sort(), [groupedStyles]);
  const hasPreviewImage = Boolean(resolvedImageUrl);
  const totalQuantity = useMemo(() => Object.values(sizeQuantities).reduce((sum, qty) => sum + qty, 0), [sizeQuantities]);
  const isSimpleArtwork = imageComplexity === 'Simple 1 color' || imageComplexity === '2-3 colors';
  const isFullColorArtwork = imageComplexity === 'Full color / photo';
  const printRecommendation = useMemo(() => {
    if (totalQuantity < 24) return { method: 'DTF', reason: 'Lower quantities are usually best suited for DTF.', badge: 'Recommended: DTF', reviewNeeded: false };
    if (totalQuantity <= 47 && isFullColorArtwork) return { method: 'DTF', reason: 'Mid-size orders with full-color artwork are usually better with DTF.', badge: 'Recommended: DTF', reviewNeeded: false };
    if (totalQuantity <= 47 && isSimpleArtwork) return { method: 'Either method', reason: 'At this quantity and artwork complexity, DTF or Screen Print can work well.', badge: 'Review Needed', reviewNeeded: true };
    if (totalQuantity >= 48 && isSimpleArtwork) return { method: 'Screen Print', reason: 'Higher quantities with simpler artwork usually benefit from Screen Print.', badge: 'Recommended: Screen Print', reviewNeeded: false };
    return { method: 'DTF or artwork review needed', reason: 'High quantity with full-color artwork may still fit DTF, but should be reviewed.', badge: 'Review Needed', reviewNeeded: true };
  }, [isFullColorArtwork, isSimpleArtwork, totalQuantity]);
  const recommendationBadgeClass = printRecommendation.badge === 'Recommended: DTF'
    ? 'bg-indigo-100 text-indigo-700'
    : printRecommendation.badge === 'Recommended: Screen Print'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-amber-100 text-amber-700';
  const manualMethodWarning = useMemo(() => {
    if (printMethod === 'Not sure / Recommend for me') return '';
    if (printMethod === 'DTF' && totalQuantity >= 48 && isSimpleArtwork) return 'DTF works, but Screen Print may be more ideal for high-quantity simple artwork.';
    if (printMethod === 'Screen Print' && totalQuantity < 24) return 'Screen Print works, but DTF is usually more practical for low quantities.';
    if (printMethod === 'Screen Print' && isFullColorArtwork) return 'Screen Print may be less ideal for full-color/photo artwork; DTF is often preferred.';
    return '';
  }, [isFullColorArtwork, isSimpleArtwork, printMethod, totalQuantity]);
  const estimatedLocationName = printLocation === 'full-front' ? 'Front' : printLocation === 'full-back' ? 'Back' : 'Left Chest';
  const estimatedColorCount: 1 | 2 | 3 | 4 = imageComplexity === 'Simple 1 color' ? 1 : imageComplexity === '2-3 colors' ? 3 : 4;
  const estimatedDtfSize = imageComplexity === 'Simple 1 color' ? { width: 10, height: 10 } : imageComplexity === '2-3 colors' ? { width: 11, height: 11 } : { width: 12, height: 12 };
  const dtfEstimate = useMemo(() => calculateDtfPricing({ pieces: [{ ...estimatedDtfSize, quantity: totalQuantity }] }), [estimatedDtfSize, totalQuantity]);
  const screenEstimate = useMemo(() => calculateScreenPrintPricing({ quantity: totalQuantity, setupFeeEnabled: true, locations: [{ name: estimatedLocationName, colors: estimatedColorCount }] }), [estimatedColorCount, estimatedLocationName, totalQuantity]);
  const recommendationByCost = useMemo(() => recommendPrintMethodByCost({ pieces: [{ ...estimatedDtfSize, quantity: totalQuantity }] }, { quantity: totalQuantity, setupFeeEnabled: true, locations: [{ name: estimatedLocationName, colors: estimatedColorCount }] }), [estimatedColorCount, estimatedDtfSize, estimatedLocationName, totalQuantity]);
  const estimatedMethod = printMethod === 'Not sure / Recommend for me' ? recommendationByCost.recommendedMethod : printMethod === 'DTF' ? 'dtf' : 'screen_print';
  const estimatedSetupFee = estimatedMethod === 'screen_print' ? screenEstimate.setupFee : 0;
  const estimatedDecorationCost = estimatedMethod === 'screen_print' ? screenEstimate.totalPrintCharge : dtfEstimate.totalCost;
  const estimatedPerShirt = totalQuantity > 0 ? estimatedDecorationCost / totalQuantity : 0;
  const selectedColorName = selectedPreview?.colorName || selectedProduct.availableColors.find((color) => color.value === shirtColor)?.name || shirtColor;
  const selectedProductName = selectedPreview?.productName || selectedProduct.name;
  const sizeBreakdown = useMemo(() => SIZE_FIELDS.filter((size) => sizeQuantities[size] > 0).map((size) => `${size}: ${sizeQuantities[size]}`).join(', ') || 'No sizes added', [sizeQuantities]);
  const designPreviewStatus = capturedDesignPreview ? 'Captured design preview available' : 'No captured design preview';

  const quoteSummaryText = useMemo(() => [
    'Hue Shirt Design Studio - Quote Summary',
    '',
    'Customer/Project Info',
    `Name: ${customerInfo.name || 'N/A'}`,
    `Business/Organization: ${customerInfo.organization || 'N/A'}`,
    `Email: ${customerInfo.email || 'N/A'}`,
    `Phone: ${customerInfo.phone || 'N/A'}`,
    `Needed-by Date: ${customerInfo.neededByDate || 'N/A'}`,
    `Notes: ${customerInfo.notes || 'N/A'}`,
    '',
    'Quote Summary',
    `Selected Product: ${selectedProductName}`,
    `Selected Color: ${selectedColorName}`,
    `Total Quantity: ${totalQuantity}`,
    `Size Breakdown: ${sizeBreakdown}`,
    `Print Method Recommendation: ${recommendationByCost.recommendedMethod === 'dtf' ? 'DTF' : 'Screen Print'}`,
    `Estimate-only Pricing: Setup ${estimatedSetupFee.toFixed(2)} | Decoration ${estimatedDecorationCost.toFixed(2)} | Per Shirt ${estimatedPerShirt.toFixed(2)}`,
    `Design Preview Status: ${designPreviewStatus}`,
    `Design Preview Captured: ${capturedDesignPreview ? 'Yes' : 'No'}`,
    `Design Export Status: Ready (${shirtView} / ${printLocation})`,
    '',
    'This is an estimate only. Final pricing and method may change after review.'
  ].join('\n'), [customerInfo, designPreviewStatus, estimatedDecorationCost, estimatedPerShirt, estimatedSetupFee, printLocation, recommendationByCost.recommendedMethod, selectedColorName, selectedProductName, shirtView, sizeBreakdown, totalQuantity]);


  const captureDesignPreview = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
    setCapturedDesignPreview(dataUrl);
    window.alert('Design preview captured for quote summary.');
  };

  const copyQuoteSummary = async () => {
    try {
      await navigator.clipboard.writeText(quoteSummaryText);
      window.alert('Quote summary copied to clipboard.');
    } catch {
      window.alert('Unable to access clipboard. Please copy from the quote summary text.');
    }
  };

  const exportQuoteSummary = (format: 'txt' | 'json') => {
    const quoteData = {
      customerInfo,
      selectedProduct: selectedProductName,
      selectedColor: selectedColorName,
      sizeBreakdown,
      totalQuantity,
      printMethodRecommendation: recommendationByCost.recommendedMethod === 'dtf' ? 'DTF' : 'Screen Print',
      estimateOnlyPricing: {
        setupFee: Number(estimatedSetupFee.toFixed(2)),
        decorationCost: Number(estimatedDecorationCost.toFixed(2)),
        perShirt: Number(estimatedPerShirt.toFixed(2))
      },
      capturedDesignPreviewStatus: capturedDesignPreview ? 'Captured' : 'Not captured',
      timestamp: new Date().toISOString(),
      summary: {
        selectedProduct: selectedProductName,
        selectedColor: selectedColorName,
        totalQuantity,
        sizeBreakdown,
        printMethodRecommendation: recommendationByCost.recommendedMethod === 'dtf' ? 'DTF' : 'Screen Print',
        estimateOnlyPricing: {
          setupFee: Number(estimatedSetupFee.toFixed(2)),
          decorationCost: Number(estimatedDecorationCost.toFixed(2)),
          perShirt: Number(estimatedPerShirt.toFixed(2))
        },
        designPreviewStatus,
        capturedDesignPreview: Boolean(capturedDesignPreview),
        designExportStatus: `Ready (${shirtView} / ${printLocation})`
      }
    };
    const content = format === 'json' ? JSON.stringify(quoteData, null, 2) : quoteSummaryText;
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `quote-summary.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const getLabel = (obj: FabricObject, index: number) => {
    if (obj.type === 'i-text') return `Text ${index}`;
    if (obj.type === 'image') return `Image ${index}`;
    return `${obj.type} ${index}`;
  };

  const refreshLayers = (canvas: Canvas) => {
    const selected = canvas.getActiveObject();
    const items = canvas.getObjects().map((obj, idx) => {
      const layerObj = obj as FabricObject & { data?: { layerId?: string } };
      if (!layerObj.data) layerObj.data = {};
      if (!layerObj.data.layerId) layerObj.data.layerId = `layer-${Date.now()}-${idx}`;
      return {
        id: layerObj.data.layerId,
        name: getLabel(obj, idx + 1),
        type: obj.type,
        isActive: selected === obj
      };
    }).reverse();
    setLayers(items);
  };

  const clampToArea = (obj: FabricObject) => {
    obj.setCoords();
    const bounds = obj.getBoundingRect();
    let left = obj.left || 0;
    let top = obj.top || 0;

    if (bounds.left < 0) left -= bounds.left;
    if (bounds.top < 0) top -= bounds.top;
    if (bounds.left + bounds.width > designArea.width) left -= bounds.left + bounds.width - designArea.width;
    if (bounds.top + bounds.height > designArea.height) top -= bounds.top + bounds.height - designArea.height;

    obj.set({ left, top });
    obj.setCoords();
  };

  useEffect(() => {
    const nextColor = selectedProduct.availableColors[0]?.value;
    if (nextColor && !selectedProduct.availableColors.some((color) => color.value === shirtColor)) setShirtColor(nextColor);
    if (!selectedProduct.defaultPrintLocations.includes(printLocation)) setPrintLocation(selectedProduct.defaultPrintLocations[0]);
  }, [selectedProduct, shirtColor, printLocation]);

  const selectedStyleItems = useMemo(() => selectedPreview ? previewCatalog.filter((item) => item.styleNumber === selectedPreview.styleNumber) : [], [previewCatalog, selectedPreview]);
  const availableStyleColors = useMemo(() => selectedStyleItems.map((item) => ({ name: item.colorName, value: COLOR_MAP[item.colorName.toLowerCase()] || '#94a3b8' })), [selectedStyleItems]);

  useEffect(() => {
    if (!selectedPreview) return;
    const next = COLOR_MAP[selectedPreview.colorName.toLowerCase()];
    if (next) setShirtColor(next);
  }, [selectedPreview]);

  useEffect(() => {
    const candidates = getImageCandidates(selectedPreview, imageType, shirtView);
    if (!candidates.length) {
      setResolvedImageUrl(null);
      setImageFallbackUsed(false);
      return;
    }
    let canceled = false;
    (async () => {
      for (let i = 0; i < candidates.length; i += 1) {
        try {
          const result = await fetch(candidates[i], { method: 'HEAD' });
          if (result.ok) {
            if (!canceled) {
              setResolvedImageUrl(candidates[i]);
              setImageFallbackUsed(i > 0);
            }
            return;
          }
        } catch {}
      }
      if (!canceled) {
        setResolvedImageUrl(candidates[0]);
        setImageFallbackUsed(true);
      }
    })();
    return () => { canceled = true; };
  }, [imageType, selectedPreview, shirtView]);

  const captureHistory = (canvas: Canvas) => {
    const json = JSON.stringify(canvas.toJSON());
    if (historyRef.current[historyIndexRef.current] === json) return;
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(json);
    historyIndexRef.current = historyRef.current.length - 1;
  };

  const restoreHistory = (offset: number) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const nextIndex = historyIndexRef.current + offset;
    if (nextIndex < 0 || nextIndex >= historyRef.current.length) return;
    historyIndexRef.current = nextIndex;
    canvas.loadFromJSON(historyRef.current[nextIndex], () => {
      canvas.requestRenderAll();
      refreshLayers(canvas);
    });
  };

  const syncTextControls = (obj: FabricObject | null) => {
    if (obj && obj.type === 'i-text') {
      const textObj = obj as IText;
      setFontFamily(textObj.fontFamily || FONT_OPTIONS[0].value);
      setFontSize(typeof textObj.fontSize === 'number' ? textObj.fontSize : 30);
      setIsBold((textObj.fontWeight as string) === 'bold');
      setIsItalic(textObj.fontStyle === 'italic');
      setTextColor(typeof textObj.fill === 'string' ? textObj.fill : '#111827');
    }
  };

  useEffect(() => {
    const canvasEl = canvasElRef.current;
    if (!canvasEl) return;
    const fabricCanvas = new Canvas(canvasEl, { width: designArea.width, height: designArea.height, backgroundColor: 'transparent', preserveObjectStacking: true, selectionColor: 'rgba(79,70,229,0.12)', selectionBorderColor: '#4f46e5' });
    fabricCanvas.forEachObject((obj) => obj.set({ cornerColor: '#4338ca', cornerStrokeColor: '#eef2ff', cornerStyle: 'circle', cornerSize: 14, touchCornerSize: 24, borderColor: '#4338ca', borderScaleFactor: 2, transparentCorners: false }));

    const updateSelection = () => {
      const selected = fabricCanvas.getActiveObject();
      setActiveObject(selected || null);
      syncTextControls(selected || null);
      refreshLayers(fabricCanvas);
    };

    fabricCanvas.on('selection:created', updateSelection);
    fabricCanvas.on('selection:updated', updateSelection);
    fabricCanvas.on('selection:cleared', () => {
      setActiveObject(null);
      refreshLayers(fabricCanvas);
    });

    fabricCanvas.on('object:moving', (event) => {
      const obj = event.target;
      if (!obj) return;
      const centerPoint = obj.getCenterPoint();
      const centerX = designArea.width / 2;
      const centerY = designArea.height / 2;
      if (Math.abs(centerPoint.x - centerX) <= 14) obj.left = (obj.left || 0) + (centerX - centerPoint.x);
      if (Math.abs(centerPoint.y - centerY) <= 14) obj.top = (obj.top || 0) + (centerY - centerPoint.y);
      clampToArea(obj);
    });
    fabricCanvas.on('object:scaling', (event) => {
      const obj = event.target;
      if (obj) clampToArea(obj);
    });

    const onKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const command = isMac ? event.metaKey : event.ctrlKey;
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        restoreHistory(event.shiftKey ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    fabricCanvas.on('object:added', () => { captureHistory(fabricCanvas); refreshLayers(fabricCanvas); });
    fabricCanvas.on('object:modified', () => { captureHistory(fabricCanvas); refreshLayers(fabricCanvas); });
    fabricCanvas.on('object:removed', () => { captureHistory(fabricCanvas); refreshLayers(fabricCanvas); });
    captureHistory(fabricCanvas);
    refreshLayers(fabricCanvas);

    fabricCanvasRef.current = fabricCanvas;
    return () => { window.removeEventListener('keydown', onKeyDown); fabricCanvas.dispose(); fabricCanvasRef.current = null; };
  }, []);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: designArea.width, height: designArea.height });
    canvas.requestRenderAll();
  }, [designArea]);

  const addText = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const text = new IText(textValue.trim() || 'Your text', { left: designArea.width / 2, top: designArea.height / 2, originX: 'center', originY: 'center', fontSize, fontFamily, fontWeight: isBold ? 'bold' : 'normal', fontStyle: isItalic ? 'italic' : 'normal', fill: textColor, cornerColor: '#4338ca', cornerSize: 14, touchCornerSize: 24, borderColor: '#4338ca', transparentCorners: false });
    canvas.add(text); canvas.setActiveObject(text); canvas.renderAll();
  };

  const editSelected = (fn: (obj: FabricObject) => void) => { const canvas = fabricCanvasRef.current; const selected = canvas?.getActiveObject(); if (!canvas || !selected) return; fn(selected); clampToArea(selected); canvas.requestRenderAll(); refreshLayers(canvas); };
  const deleteSelected = () => { const canvas = fabricCanvasRef.current; if (!canvas) return; const selected = canvas.getActiveObject(); if (!selected) return; if (selected.type === 'activeSelection') (selected as ActiveSelection).getObjects().forEach((obj) => canvas.remove(obj)); else canvas.remove(selected); canvas.discardActiveObject(); canvas.requestRenderAll(); refreshLayers(canvas); };

  const onUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; const canvas = fabricCanvasRef.current; if (!file || !canvas) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const img = await FabricImage.fromURL(reader.result as string);
      img.set({ left: designArea.width / 2, top: designArea.height / 2, originX: 'center', originY: 'center', cornerColor: '#4338ca', cornerSize: 14, touchCornerSize: 24, borderColor: '#4338ca', transparentCorners: false });
      const maxWidth = Math.min(150, designArea.width * 0.75); if (img.width && img.width > maxWidth) img.scale(maxWidth / img.width);
      canvas.add(img); clampToArea(img); canvas.setActiveObject(img); canvas.renderAll(); event.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const alignSelected = (axis: 'horizontal' | 'vertical') => editSelected((obj) => {
    const center = obj.getCenterPoint();
    if (axis === 'horizontal') obj.left = (obj.left || 0) + (designArea.width / 2 - center.x);
    if (axis === 'vertical') obj.top = (obj.top || 0) + (designArea.height / 2 - center.y);
  });


  const clearCatalogFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
    setCategoryFilter('all');
  };

  const exportDesign = () => {
    const canvas = fabricCanvasRef.current; if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
    const link = document.createElement('a'); link.download = `shirt-design-${shirtView}-${printLocation}.png`; link.href = dataUrl; link.click();
  };

  return <main className="mx-auto min-h-screen w-full max-w-7xl bg-slate-100 px-3 py-4 md:px-6"><header className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5"><h1 className="text-xl font-semibold tracking-tight md:text-2xl">Hue Shirt Design Studio</h1></header><div className="grid gap-4 lg:grid-cols-[280px_300px_1fr]"><aside className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Catalog Search</h2><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search style, product, brand, category, color, or image URL" className="w-full rounded-lg border px-3 py-2 text-sm" /><div className="flex flex-wrap gap-1"><button onClick={() => setSearchQuery('2000')} className="rounded border px-2 py-1 text-[11px]">Search 2000</button><button onClick={() => setSearchQuery('Gildan')} className="rounded border px-2 py-1 text-[11px]">Search gildan</button><button onClick={() => setSearchQuery('hoodie')} className="rounded border px-2 py-1 text-[11px]">Search hoodie</button><button onClick={() => setSearchQuery('black')} className="rounded border px-2 py-1 text-[11px]">Search black</button></div><div className="grid grid-cols-2 gap-2"><select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} className="rounded-lg border px-2 py-1.5 text-xs"><option value="all">All Brands</option>{brandOptions.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border px-2 py-1.5 text-xs"><option value="all">All Categories</option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>{hasActiveCatalogFilters ? <button onClick={clearCatalogFilters} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">Clear Filters</button> : null}<div className="space-y-0.5 text-xs text-slate-500"><p>Total generated rows loaded: {totalSampleRowsLoaded}</p><p>Total unique styles: {totalUniqueStyles}</p><p>Visible results: {filteredPreviewCatalog.length}</p><p>Catalog mode: generated sample</p></div><p className="text-[11px] text-slate-400">Debug: query="{searchQuery || '(empty)'}" • visible={filteredPreviewCatalog.length}</p>{filteredPreviewCatalog.length === 0 ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"><p className="font-semibold">No products match your current search and filters.</p><p>Search: {searchQuery || '(empty)'}</p><p>Brand: {brandFilter === 'all' ? 'All Brands' : brandFilter}</p><p>Category: {categoryFilter === 'all' ? 'All Categories' : categoryFilter}</p><button onClick={clearCatalogFilters} className="mt-2 rounded border border-amber-400 bg-white px-2 py-1">Clear Filters</button></div> : null}<div className="max-h-[620px] space-y-1 overflow-y-auto pr-1">{filteredPreviewCatalog.map((group, index) => { const catalogIndex = previewCatalog.findIndex((product) => product.styleNumber === group.styleNumber); return <button key={`${group.styleNumber}-${index}`} onClick={() => setSelectedPreviewId(catalogIndex)} className={`w-full rounded-lg border px-2 py-2 text-left text-xs ${selectedPreviewId === catalogIndex ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}><p className="font-semibold">{group.styleNumber}</p><p className="truncate text-slate-600">{group.name}</p><p className="text-slate-500">{group.brand} • {group.items.length} colors</p></button>; })}</div></aside><aside className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tools</h2><section><p className="mb-2 text-sm font-medium">Mockup Type Override</p><select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">{SAMPLE_PRODUCT_CATALOG.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></section><section><p className="mb-2 text-sm font-medium">View</p><div className="grid grid-cols-2 gap-2">{(['front', 'back'] as ShirtView[]).map((view) => <button key={view} onClick={() => setShirtView(view)} className={`rounded-lg border px-3 py-2 text-sm capitalize ${shirtView === view ? 'bg-slate-900 text-white' : ''}`}>{view}</button>)}</div></section><section><p className="mb-2 text-sm font-medium">Print Location</p><select value={printLocation} onChange={(e) => setPrintLocation(e.target.value as PrintLocation)} className="w-full rounded-lg border px-3 py-2 text-sm">{selectedProduct.defaultPrintLocations.map((location) => <option key={location} value={location}>{PRINT_AREA_CONFIG[location].label}</option>)}</select></section><section className="space-y-2"><input value={textValue} onChange={(event) => setTextValue(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Type your text" /><button onClick={addText} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Add Text</button><label className="block cursor-pointer rounded-lg border border-dashed p-3 text-center text-sm">Choose Image<input onChange={onUploadImage} className="hidden" type="file" accept="image/*" /></label></section><section><p className="mb-2 text-sm font-medium">Color</p><div className="flex flex-wrap gap-2">{availableStyleColors.map((color) => <button key={color.name} type="button" onClick={() => { const match = selectedStyleItems.find((item) => item.colorName === color.name); if (match) { const idx = previewCatalog.findIndex((entry) => entry.styleNumber === match.styleNumber && entry.colorName === match.colorName); if (idx >= 0) setSelectedPreviewId(idx); } setShirtColor(color.value); }} className={`h-8 w-8 rounded-full border-2 ${shirtColor === color.value ? 'border-black' : 'border-slate-300'}`} style={{ background: color.value }} title={color.name} />)}</div></section><section><p className="mb-2 text-sm font-medium">Image Type</p><div className="grid grid-cols-2 gap-2">{(["flat", "model"] as ImageType[]).map((type) => <button key={type} onClick={() => setImageType(type)} className={`rounded-lg border px-3 py-2 text-sm capitalize ${imageType === type ? "bg-slate-900 text-white" : ""}`}>{type === "flat" ? "Flat/Product" : "Model/Worn"}</button>)}</div></section><section className="rounded-lg border bg-slate-50 p-3 text-xs"><p className="font-semibold">Selected Catalog Product</p><p>Style: {selectedPreview?.styleNumber || 'N/A'}</p><p>Name: {selectedPreview?.productName || 'N/A'}</p><p>Brand: {selectedPreview?.brand || 'N/A'}</p><p>Color: {selectedPreview?.colorName || 'N/A'}</p><p>Image URL Status: {hasPreviewImage ? 'Available' : 'Not available'}</p><p className="truncate">Image URL: {resolvedImageUrl || selectedPreview?.productImageUrl || 'N/A'}</p>{imageFallbackUsed ? <p className="mt-1 text-amber-700">Image fallback used</p> : null}</section><section className="rounded-lg border bg-slate-50 p-3"><p className="mb-2 text-sm font-medium">Order Details</p><div className="grid grid-cols-4 gap-2">{SIZE_FIELDS.map((size) => <label key={size} className="text-xs"><span className="mb-1 block font-medium">{size}</span><input type="number" min={0} value={sizeQuantities[size]} onChange={(event) => setSizeQuantities((prev) => ({ ...prev, [size]: Math.max(0, Number(event.target.value) || 0) }))} className="w-full rounded border px-2 py-1" /></label>)}</div><p className="mt-2 text-xs font-semibold">Total Quantity: {totalQuantity}</p><label className="mt-3 block text-xs font-medium">Print Method<select value={printMethod} onChange={(event) => setPrintMethod(event.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm"><option>Not sure / Recommend for me</option><option>DTF</option><option>Screen Print</option></select></label><label className="mt-2 block text-xs font-medium">Image Complexity<select value={imageComplexity} onChange={(event) => setImageComplexity(event.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm"><option>Simple 1 color</option><option>2-3 colors</option><option>Full color / photo</option></select></label><div className="mt-3 rounded-md bg-white p-2 text-xs text-slate-700"><div className="mb-2 flex items-center justify-between gap-2"><p className="font-semibold">{printMethod === 'Not sure / Recommend for me' ? 'Recommended method' : 'Selected method'}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${recommendationBadgeClass}`}>{printRecommendation.badge}</span></div><p><span className="font-medium">{printMethod === 'Not sure / Recommend for me' ? printRecommendation.method : printMethod}</span></p><p className="mt-1">{printMethod === 'Not sure / Recommend for me' ? printRecommendation.reason : `You selected ${printMethod}.`}</p>{printMethod !== 'Not sure / Recommend for me' && manualMethodWarning ? <p className="mt-1 text-amber-700">{manualMethodWarning}</p> : null}<p className="mt-1 text-slate-500">Final method may change after artwork review.</p></div></section><section className="rounded-lg border bg-slate-50 p-3"><p className="mb-2 text-sm font-medium">Customer / Project Info</p><div className="space-y-2 text-xs"><input value={customerInfo.name} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, name: event.target.value }))} placeholder="Name" className="w-full rounded border px-2 py-1.5" /><input value={customerInfo.organization} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, organization: event.target.value }))} placeholder="Business / Organization" className="w-full rounded border px-2 py-1.5" /><input value={customerInfo.email} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" className="w-full rounded border px-2 py-1.5" /><input value={customerInfo.phone} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Phone" className="w-full rounded border px-2 py-1.5" /><label className="block font-medium">Needed-by Date<input type="date" value={customerInfo.neededByDate} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, neededByDate: event.target.value }))} className="mt-1 w-full rounded border px-2 py-1.5" /></label><textarea value={customerInfo.notes} onChange={(event) => setCustomerInfo((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" rows={3} className="w-full rounded border px-2 py-1.5" /></div></section><section className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs"><p className="font-semibold text-indigo-900">Quote Summary (Estimate Only)</p><p className="mt-1">Selected Product: {selectedProductName}</p><p>Selected Color: {selectedColorName}</p><p>Total Quantity: {totalQuantity}</p><p>Size Breakdown: {sizeBreakdown}</p><p>Print Method Recommendation: {recommendationByCost.recommendedMethod === 'dtf' ? 'DTF' : 'Screen Print'}</p><p>Estimate-only Pricing: Setup ${estimatedSetupFee.toFixed(2)} • Decoration ${estimatedDecorationCost.toFixed(2)} • Per Shirt ${estimatedPerShirt.toFixed(2)}</p><p>Design Preview Status: {designPreviewStatus}</p><p>Design Preview Captured: {capturedDesignPreview ? 'Yes' : 'No'}</p>{capturedDesignPreview ? <img src={capturedDesignPreview} alt="Captured design preview" className="mt-2 h-20 w-20 rounded border object-contain bg-white" /> : null}<p>Design Export Status: Ready ({shirtView} / {printLocation})</p><p className="mt-2 text-indigo-800">Final pricing may change after artwork review, garment availability, and exact print requirements.</p><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><button onClick={captureDesignPreview} className="rounded-lg border border-indigo-400 bg-white px-3 py-2 text-sm sm:col-span-2">Capture Design Preview</button><button onClick={copyQuoteSummary} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Copy Quote Summary</button><button onClick={() => exportQuoteSummary('txt')} className="rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm">Export Quote Summary (.txt)</button><button onClick={() => exportQuoteSummary('json')} className="rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm sm:col-span-2">Export Quote Summary (.json)</button></div></section><button onClick={exportDesign} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white">Download PNG</button></aside>
<section className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 md:p-4"><div className="mb-3 flex flex-wrap gap-1.5 border-b pb-3 sm:gap-2"><button onClick={() => restoreHistory(-1)} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">Undo</button><button onClick={() => restoreHistory(1)} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">Redo</button><button onClick={deleteSelected} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">Delete</button><button onClick={() => alignSelected('horizontal')} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">Center H</button><button onClick={() => alignSelected('vertical')} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">Center V</button><button onClick={() => { const next = Math.max(0.5, zoom - 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">-</button><span className="inline-flex items-center px-1 text-sm">{Math.round(zoom * 100)}%</span><button onClick={() => { const next = Math.min(2, zoom + 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">+</button></div>
<div className="grid gap-3 md:grid-cols-[1fr_220px]"><div className="flex items-center justify-center p-1 md:p-4"><div className="relative h-[440px] w-[380px] max-w-full">{hasPreviewImage && resolvedImageUrl ? <img src={resolvedImageUrl} alt={`${selectedPreview.productName} ${selectedPreview.colorName}`} className="h-full w-full rounded-md object-contain" /> : <TshirtShape color={shirtColor} bodyPath={selectedProduct.mockups[shirtView]} view={shirtView} />}<div className="pointer-events-none absolute rounded-md border-2 border-dashed border-indigo-500/70 bg-indigo-100/20" style={{ top: designArea.top, left: designArea.left, width: designArea.width, height: designArea.height }} /><div className="absolute overflow-hidden rounded-md" style={{ top: designArea.top, left: designArea.left, width: designArea.width, height: designArea.height }}><canvas ref={canvasElRef} className="h-full w-full touch-none" /></div></div></div><aside className="rounded-xl border bg-slate-50 p-2"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Layers</p><div className="space-y-1">{layers.length === 0 ? <p className="text-xs text-slate-500">No objects yet</p> : layers.map((layer) => <button key={layer.id} onClick={() => { const canvas = fabricCanvasRef.current; if (!canvas) return; const target = canvas.getObjects().find((obj) => (obj as FabricObject & { data?: { layerId?: string } }).data?.layerId === layer.id); if (!target) return; canvas.setActiveObject(target); canvas.requestRenderAll(); setActiveObject(target); refreshLayers(canvas); }} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs ${layer.isActive ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}><span>{layer.name}</span><span className="opacity-70">{layer.type}</span></button>)}</div></aside></div></section></div></main>;
}
