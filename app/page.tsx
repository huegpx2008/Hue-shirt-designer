'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ActiveSelection, Canvas, FabricImage, IText, Object as FabricObject } from 'fabric';
import TshirtShape from '@/components/tshirt-shape';
import { PRINT_AREA_CONFIG, ProductCatalogItem, PrintLocation, SAMPLE_PRODUCT_CATALOG } from '@/components/product-catalog';
import sanMarPreview from '@/public/data/catalog-preview-25.json';

type ShirtView = 'front' | 'back';
type FontOption = { label: string; value: string };
type LayerItem = { id: string; name: string; type: string; isActive: boolean };
type SanMarPreviewItem = { styleNumber: string; productName: string; brand: string; color: string; firstImageUrl?: string };

const FONT_OPTIONS: FontOption[] = [
  { label: 'Inter', value: 'Inter, Arial, sans-serif' },
  { label: 'Poppins', value: 'Poppins, Arial, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' }
];

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
  const previewCatalog = useMemo<SanMarPreviewItem[]>(() => (sanMarPreview as SanMarPreviewItem[]).slice(0, 25), []);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [selectedPreviewId, setSelectedPreviewId] = useState(0);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const designArea = useMemo(() => PRINT_AREA_CONFIG[printLocation], [printLocation]);
  const selectedPreview = previewCatalog[selectedPreviewId];
  const filteredPreviewCatalog = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase();
    if (!query) return previewCatalog;
    return previewCatalog.filter((item) => [item.styleNumber, item.productName, item.brand, item.color].some((field) => field.toLowerCase().includes(query)));
  }, [catalogQuery, previewCatalog]);
  const hasPreviewImage = Boolean(selectedPreview?.firstImageUrl);

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

  useEffect(() => {
    if (!selectedPreview) return;
    const colorMap: Record<string, string> = { white: '#ffffff', black: '#111111', ash: '#d1d5db', navy: '#1f365f', 'true red': '#b91c1c', 'forest green': '#166534' };
    const next = colorMap[selectedPreview.color.toLowerCase()];
    if (next) setShirtColor(next);
  }, [selectedPreview]);

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

  const exportDesign = () => {
    const canvas = fabricCanvasRef.current; if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
    const link = document.createElement('a'); link.download = `shirt-design-${shirtView}-${printLocation}.png`; link.href = dataUrl; link.click();
  };

  return <main className="mx-auto min-h-screen w-full max-w-7xl bg-slate-100 px-3 py-4 md:px-6"><header className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5"><h1 className="text-xl font-semibold tracking-tight md:text-2xl">Hue Shirt Design Studio</h1></header><div className="grid gap-4 lg:grid-cols-[280px_300px_1fr]"><aside className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Catalog Search</h2><input value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)} placeholder="Search style, product, brand, color" className="w-full rounded-lg border px-3 py-2 text-sm" /><div className="max-h-[620px] space-y-1 overflow-y-auto pr-1">{filteredPreviewCatalog.map((item, index) => { const catalogIndex = previewCatalog.findIndex((product) => product === item); return <button key={`${item.styleNumber}-${item.color}-${index}`} onClick={() => setSelectedPreviewId(catalogIndex)} className={`w-full rounded-lg border px-2 py-2 text-left text-xs ${selectedPreviewId === catalogIndex ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}><p className="font-semibold">{item.styleNumber} • {item.color}</p><p className="truncate text-slate-600">{item.productName}</p><p className="text-slate-500">{item.brand}</p></button>; })}</div></aside><aside className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tools</h2><section><p className="mb-2 text-sm font-medium">Product Type</p><select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">{SAMPLE_PRODUCT_CATALOG.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></section><section><p className="mb-2 text-sm font-medium">View</p><div className="grid grid-cols-2 gap-2">{(['front', 'back'] as ShirtView[]).map((view) => <button key={view} onClick={() => setShirtView(view)} className={`rounded-lg border px-3 py-2 text-sm capitalize ${shirtView === view ? 'bg-slate-900 text-white' : ''}`}>{view}</button>)}</div></section><section><p className="mb-2 text-sm font-medium">Print Location</p><select value={printLocation} onChange={(e) => setPrintLocation(e.target.value as PrintLocation)} className="w-full rounded-lg border px-3 py-2 text-sm">{selectedProduct.defaultPrintLocations.map((location) => <option key={location} value={location}>{PRINT_AREA_CONFIG[location].label}</option>)}</select></section><section className="space-y-2"><input value={textValue} onChange={(event) => setTextValue(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Type your text" /><button onClick={addText} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Add Text</button><label className="block cursor-pointer rounded-lg border border-dashed p-3 text-center text-sm">Choose Image<input onChange={onUploadImage} className="hidden" type="file" accept="image/*" /></label></section><section><p className="mb-2 text-sm font-medium">Color</p><div className="flex flex-wrap gap-2">{selectedProduct.availableColors.map((color) => <button key={color.value} type="button" onClick={() => setShirtColor(color.value)} className={`h-8 w-8 rounded-full border-2 ${shirtColor === color.value ? 'border-black' : 'border-slate-300'}`} style={{ background: color.value }} title={color.name} />)}</div></section><section className="rounded-lg border bg-slate-50 p-3 text-xs"><p className="font-semibold">Selected Catalog Product</p><p>Style: {selectedPreview?.styleNumber || 'N/A'}</p><p>Name: {selectedPreview?.productName || 'N/A'}</p><p>Brand: {selectedPreview?.brand || 'N/A'}</p><p>Color: {selectedPreview?.color || 'N/A'}</p><p>Image URL: {hasPreviewImage ? 'Available' : 'Not available'}</p></section><button onClick={exportDesign} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white">Download PNG</button></aside>
<section className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 md:p-4"><div className="mb-3 flex flex-wrap gap-1.5 border-b pb-3 sm:gap-2"><button onClick={() => restoreHistory(-1)} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">Undo</button><button onClick={() => restoreHistory(1)} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">Redo</button><button onClick={deleteSelected} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">Delete</button><button onClick={() => alignSelected('horizontal')} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">Center H</button><button onClick={() => alignSelected('vertical')} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">Center V</button><button onClick={() => { const next = Math.max(0.5, zoom - 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">-</button><span className="inline-flex items-center px-1 text-sm">{Math.round(zoom * 100)}%</span><button onClick={() => { const next = Math.min(2, zoom + 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">+</button></div>
<div className="grid gap-3 md:grid-cols-[1fr_220px]"><div className="flex items-center justify-center p-1 md:p-4"><div className="relative h-[440px] w-[380px] max-w-full">{hasPreviewImage ? <img src={selectedPreview.firstImageUrl} alt={`${selectedPreview.productName} ${selectedPreview.color}`} className="h-full w-full rounded-md object-contain" /> : <TshirtShape color={shirtColor} bodyPath={selectedProduct.mockups[shirtView]} view={shirtView} />}<div className="pointer-events-none absolute rounded-md border-2 border-dashed border-indigo-500/70 bg-indigo-100/20" style={{ top: designArea.top, left: designArea.left, width: designArea.width, height: designArea.height }} /><div className="absolute overflow-hidden rounded-md" style={{ top: designArea.top, left: designArea.left, width: designArea.width, height: designArea.height }}><canvas ref={canvasElRef} className="h-full w-full touch-none" /></div></div></div><aside className="rounded-xl border bg-slate-50 p-2"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Layers</p><div className="space-y-1">{layers.length === 0 ? <p className="text-xs text-slate-500">No objects yet</p> : layers.map((layer) => <button key={layer.id} onClick={() => { const canvas = fabricCanvasRef.current; if (!canvas) return; const target = canvas.getObjects().find((obj) => (obj as FabricObject & { data?: { layerId?: string } }).data?.layerId === layer.id); if (!target) return; canvas.setActiveObject(target); canvas.requestRenderAll(); setActiveObject(target); refreshLayers(canvas); }} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs ${layer.isActive ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}><span>{layer.name}</span><span className="opacity-70">{layer.type}</span></button>)}</div></aside></div></section></div></main>;
}
