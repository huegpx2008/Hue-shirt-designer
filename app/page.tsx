'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ActiveSelection, Canvas, FabricImage, IText, Object as FabricObject } from 'fabric';
import { SHIRT_COLORS, ShirtColorValue } from '@/components/color-options';
import TshirtShape from '@/components/tshirt-shape';

type ShirtStyle = 'short-sleeve-tee' | 'long-sleeve-tee' | 'hoodie';
type ShirtView = 'front' | 'back';
type PrintLocation = 'full-front' | 'left-chest' | 'full-back';

type FontOption = { label: string; value: string };

const FONT_OPTIONS: FontOption[] = [
  { label: 'Inter', value: 'Inter, Arial, sans-serif' },
  { label: 'Poppins', value: 'Poppins, Arial, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' }
];

const SHIRT_STYLES: { label: string; value: ShirtStyle }[] = [
  { label: 'Short Sleeve Tee', value: 'short-sleeve-tee' },
  { label: 'Long Sleeve Tee', value: 'long-sleeve-tee' },
  { label: 'Hoodie', value: 'hoodie' }
];

const PRINT_AREA_CONFIG: Record<PrintLocation, { label: string; top: number; left: number; width: number; height: number }> = {
  'full-front': { label: 'Full Front', top: 132, left: 80, width: 220, height: 240 },
  'left-chest': { label: 'Left Chest', top: 152, left: 118, width: 110, height: 110 },
  'full-back': { label: 'Full Back', top: 126, left: 80, width: 220, height: 250 }
};

export default function Home() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const [shirtColor, setShirtColor] = useState<ShirtColorValue>(SHIRT_COLORS[0].value);
  const [shirtStyle, setShirtStyle] = useState<ShirtStyle>('short-sleeve-tee');
  const [shirtView, setShirtView] = useState<ShirtView>('front');
  const [printLocation, setPrintLocation] = useState<PrintLocation>('full-front');
  const [textValue, setTextValue] = useState('Your text');
  const [activeObject, setActiveObject] = useState<FabricObject | null>(null);
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value);
  const [fontSize, setFontSize] = useState(30);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [textColor, setTextColor] = useState('#111827');
  const [zoom, setZoom] = useState(1);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const designArea = useMemo(() => PRINT_AREA_CONFIG[printLocation], [printLocation]);


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
    canvas.loadFromJSON(historyRef.current[nextIndex], () => canvas.requestRenderAll());
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

    const fabricCanvas = new Canvas(canvasEl, {
      width: designArea.width,
      height: designArea.height,
      backgroundColor: 'transparent',
      preserveObjectStacking: true
    });

    const updateSelection = () => {
      const selected = fabricCanvas.getActiveObject();
      setActiveObject(selected || null);
      syncTextControls(selected || null);
    };

    const clearSelection = () => setActiveObject(null);

    fabricCanvas.on('selection:created', updateSelection);
    fabricCanvas.on('selection:updated', updateSelection);
    fabricCanvas.on('selection:cleared', clearSelection);

    fabricCanvas.on('object:moving', (event) => {
      const obj = event.target;
      if (!obj) return;
      const tolerance = 8;
      const centerX = designArea.width / 2;
      const centerY = designArea.height / 2;
      const centerPoint = obj.getCenterPoint();
      if (Math.abs(centerPoint.x - centerX) <= tolerance) {
        obj.left = (obj.left || 0) + (centerX - centerPoint.x);
      }
      if (Math.abs(centerPoint.y - centerY) <= tolerance) {
        obj.top = (obj.top || 0) + (centerY - centerPoint.y);
      }
    });

    const onKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const command = isMac ? event.metaKey : event.ctrlKey;
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          restoreHistory(1);
        } else {
          restoreHistory(-1);
        }
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selected = fabricCanvas.getActiveObject();
        if (!selected) return;
        event.preventDefault();
        if (selected.type === 'activeSelection') {
          (selected as ActiveSelection).getObjects().forEach((obj) => fabricCanvas.remove(obj));
        } else {
          fabricCanvas.remove(selected);
        }
        fabricCanvas.discardActiveObject();
        fabricCanvas.requestRenderAll();
        captureHistory(fabricCanvas);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    fabricCanvas.on('object:added', () => captureHistory(fabricCanvas));
    fabricCanvas.on('object:modified', () => captureHistory(fabricCanvas));
    fabricCanvas.on('object:removed', () => captureHistory(fabricCanvas));
    captureHistory(fabricCanvas);

    fabricCanvasRef.current = fabricCanvas;

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      fabricCanvas.dispose();
      fabricCanvasRef.current = null;
    };
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

    const text = new IText(textValue.trim() || 'Your text', {
      left: designArea.width / 2,
      top: designArea.height / 2,
      originX: 'center',
      originY: 'center',
      fontSize,
      fontFamily,
      fontWeight: isBold ? 'bold' : 'normal',
      fontStyle: isItalic ? 'italic' : 'normal',
      fill: textColor
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  };

  const editSelected = (fn: (obj: FabricObject) => void) => {
    const canvas = fabricCanvasRef.current;
    const selected = canvas?.getActiveObject();
    if (!canvas || !selected) return;
    fn(selected);
    canvas.requestRenderAll();
  };

  const duplicateSelected = () => {
    editSelected(async (obj) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;
      const clone = await obj.clone();
      clone.set({ left: (obj.left || 0) + 16, top: (obj.top || 0) + 16 });
      canvas.add(clone);
      canvas.setActiveObject(clone);
    });
  };

  const deleteSelected = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const selected = canvas.getActiveObject();
    if (!selected) return;
    if (selected.type === 'activeSelection') {
      (selected as ActiveSelection).getObjects().forEach((obj) => canvas.remove(obj));
    } else {
      canvas.remove(selected);
    }
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  };

  const onUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const canvas = fabricCanvasRef.current;
    if (!file || !canvas) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const img = await FabricImage.fromURL(dataUrl);

      img.set({
        left: designArea.width / 2,
        top: designArea.height / 2,
        originX: 'center',
        originY: 'center'
      });

      const maxWidth = Math.min(150, designArea.width * 0.75);
      if (img.width && img.width > maxWidth) {
        img.scale(maxWidth / img.width);
      }

      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      event.target.value = '';
    };

    reader.readAsDataURL(file);
  };

  const exportDesign = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
    const link = document.createElement('a');
    link.download = `shirt-design-${shirtView}-${printLocation}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl bg-slate-100 px-3 py-5 md:px-6">
      <header className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Hue Shirt Design Studio</h1>
      </header>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tools</h2>
          <section>
            <p className="mb-2 text-sm font-medium">Shirt Style</p><select value={shirtStyle} onChange={(e) => setShirtStyle(e.target.value as ShirtStyle)} className="w-full rounded-lg border px-3 py-2 text-sm">{SHIRT_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          </section>
          <section>
            <p className="mb-2 text-sm font-medium">View</p><div className="grid grid-cols-2 gap-2">{(['front', 'back'] as ShirtView[]).map((view) => <button key={view} onClick={() => setShirtView(view)} className={`rounded-lg border px-3 py-2 text-sm capitalize ${shirtView === view ? 'bg-slate-900 text-white' : ''}`}>{view}</button>)}</div>
          </section>
          <section>
            <p className="mb-2 text-sm font-medium">Print Location</p><select value={printLocation} onChange={(e) => setPrintLocation(e.target.value as PrintLocation)} className="w-full rounded-lg border px-3 py-2 text-sm">{Object.entries(PRINT_AREA_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}</select>
          </section>
          <section>
            <p className="mb-2 text-sm font-medium">Text Controls</p>
            <div className="grid grid-cols-2 gap-2">
              <select value={fontFamily} onChange={(e) => { setFontFamily(e.target.value); editSelected((obj) => obj.type === 'i-text' && obj.set('fontFamily', e.target.value)); }} className="col-span-2 rounded-lg border px-3 py-2 text-sm">{FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
              <input type="number" min={8} max={120} value={fontSize} onChange={(e) => { const value = Number(e.target.value) || 30; setFontSize(value); editSelected((obj) => obj.type === 'i-text' && obj.set('fontSize', value)); }} className="rounded-lg border px-3 py-2 text-sm" />
              <input type="color" value={textColor} onChange={(e) => { setTextColor(e.target.value); editSelected((obj) => obj.type === 'i-text' && obj.set('fill', e.target.value)); }} className="h-10 rounded-lg border p-1" />
              <button onClick={() => { const next = !isBold; setIsBold(next); editSelected((obj) => obj.type === 'i-text' && obj.set('fontWeight', next ? 'bold' : 'normal')); }} className={`rounded-lg border px-3 py-2 text-sm ${isBold ? 'bg-slate-900 text-white' : ''}`}>Bold</button>
              <button onClick={() => { const next = !isItalic; setIsItalic(next); editSelected((obj) => obj.type === 'i-text' && obj.set('fontStyle', next ? 'italic' : 'normal')); }} className={`rounded-lg border px-3 py-2 text-sm ${isItalic ? 'bg-slate-900 text-white' : ''}`}>Italic</button>
            </div>
          </section>
          <section className="space-y-2">
            <input value={textValue} onChange={(event) => setTextValue(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Type your text" />
            <button onClick={addText} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Add Text</button>
            <label className="block cursor-pointer rounded-lg border border-dashed p-3 text-center text-sm">Choose Image<input onChange={onUploadImage} className="hidden" type="file" accept="image/*" /></label>
          </section>
          <section><p className="mb-2 text-sm font-medium">Shirt Color</p><div className="flex flex-wrap gap-2">{SHIRT_COLORS.map((color) => <button key={color.value} type="button" onClick={() => setShirtColor(color.value)} className={`h-8 w-8 rounded-full border-2 ${shirtColor === color.value ? 'border-black' : 'border-slate-300'}`} style={{ background: color.value }} title={color.name} />)}</div></section>
          <button onClick={exportDesign} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white">Download PNG</button>
        </aside>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex flex-wrap gap-2 border-b pb-3">
            <button onClick={() => restoreHistory(-1)} className="rounded-lg border px-3 py-1.5 text-sm">Undo</button>
            <button onClick={() => restoreHistory(1)} className="rounded-lg border px-3 py-1.5 text-sm">Redo</button>
            <button onClick={deleteSelected} className="rounded-lg border px-3 py-1.5 text-sm">Delete</button>
            <button onClick={duplicateSelected} className="rounded-lg border px-3 py-1.5 text-sm">Duplicate</button>
            <button onClick={() => editSelected((obj) => obj.set('selectable', !obj.selectable))} className="rounded-lg border px-3 py-1.5 text-sm">{activeObject?.selectable === false ? 'Unlock' : 'Lock'}</button>
            <button onClick={() => editSelected((obj) => fabricCanvasRef.current?.bringObjectForward(obj))} className="rounded-lg border px-3 py-1.5 text-sm">Bring forward</button>
            <button onClick={() => editSelected((obj) => fabricCanvasRef.current?.sendObjectBackwards(obj))} className="rounded-lg border px-3 py-1.5 text-sm">Send backward</button>
            <button onClick={() => { const next = Math.max(0.5, zoom - 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="rounded-lg border px-3 py-1.5 text-sm">-</button>
            <span className="inline-flex items-center px-1 text-sm">{Math.round(zoom * 100)}%</span>
            <button onClick={() => { const next = Math.min(2, zoom + 0.1); setZoom(next); fabricCanvasRef.current?.setZoom(next); }} className="rounded-lg border px-3 py-1.5 text-sm">+</button>
          </div>
          <div className="flex items-center justify-center p-2 md:p-6">
            <div className="relative h-[440px] w-[380px] max-w-full">
              <TshirtShape color={shirtColor} style={shirtStyle} view={shirtView} />
              <div className="pointer-events-none absolute rounded-md border-2 border-dashed border-indigo-500/70 bg-indigo-100/20" style={{ top: designArea.top, left: designArea.left, width: designArea.width, height: designArea.height }}>
                <span className="absolute -top-6 left-0 rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white">Safe print area</span>
                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-indigo-400/70" />
                <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-indigo-400/70" />
              </div>
              <div className="absolute overflow-hidden rounded-md" style={{ top: designArea.top, left: designArea.left, width: designArea.width, height: designArea.height }}>
                <canvas ref={canvasElRef} className="h-full w-full touch-none" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
