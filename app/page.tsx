'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FabricImage, Canvas, IText } from 'fabric';
import { SHIRT_COLORS, ShirtColorValue } from '@/components/color-options';
import TshirtShape from '@/components/tshirt-shape';

type ShirtStyle = 'short-sleeve-tee' | 'long-sleeve-tee' | 'hoodie';
type ShirtView = 'front' | 'back';
type PrintLocation = 'full-front' | 'left-chest' | 'full-back';

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

  const designArea = useMemo(() => PRINT_AREA_CONFIG[printLocation], [printLocation]);

  useEffect(() => {
    const canvasEl = canvasElRef.current;
    if (!canvasEl) return;

    const fabricCanvas = new Canvas(canvasEl, {
      width: designArea.width,
      height: designArea.height,
      backgroundColor: 'transparent',
      preserveObjectStacking: true
    });

    fabricCanvasRef.current = fabricCanvas;

    return () => {
      fabricCanvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.setDimensions({ width: designArea.width, height: designArea.height });
    canvas.renderAll();
  }, [designArea]);

  const addText = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const text = new IText(textValue.trim() || 'Your text', {
      left: designArea.width / 2,
      top: designArea.height / 2,
      originX: 'center',
      originY: 'center',
      fontSize: 30,
      fontFamily: 'Inter, Arial, sans-serif',
      fill: '#111827'
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
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
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Hue Shirt Designer Studio</h1>
        <p className="mt-2 text-sm text-slate-600 md:text-base">Upload artwork, add text, and create a quick shirt mockup.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
          <h2 className="mb-4 text-lg font-medium">Editor</h2>

          <section className="mb-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Shirt Style</p>
            <select
              value={shirtStyle}
              onChange={(event) => setShirtStyle(event.target.value as ShirtStyle)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring"
            >
              {SHIRT_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </section>

          <section className="mb-4">
            <p className="mb-2 text-sm font-medium text-slate-700">View</p>
            <div className="grid grid-cols-2 gap-2">
              {(['front', 'back'] as ShirtView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setShirtView(view)}
                  className={`rounded-lg border px-3 py-2 text-sm capitalize ${
                    shirtView === view ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
          </section>

          <section className="mb-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Print Location</p>
            <select
              value={printLocation}
              onChange={(event) => setPrintLocation(event.target.value as PrintLocation)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring"
            >
              {Object.entries(PRINT_AREA_CONFIG).map(([value, config]) => (
                <option key={value} value={value}>
                  {config.label}
                </option>
              ))}
            </select>
          </section>

          <section className="mb-6">
            <p className="mb-2 text-sm font-medium text-slate-700">Shirt Color</p>
            <div className="flex flex-wrap gap-2">
              {SHIRT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setShirtColor(color.value)}
                  className={`h-9 w-9 rounded-full border-2 transition ${
                    shirtColor === color.value ? 'scale-105 border-slate-900' : 'border-slate-300'
                  }`}
                  style={{ background: color.value }}
                  title={color.name}
                />
              ))}
            </div>
          </section>

          <section className="mb-6">
            <p className="mb-2 text-sm font-medium text-slate-700">Upload Logo/Image</p>
            <label className="block cursor-pointer rounded-lg border border-dashed border-slate-300 p-3 text-center text-sm text-slate-700 hover:bg-slate-50">
              Choose Image
              <input onChange={onUploadImage} className="hidden" type="file" accept="image/*" />
            </label>
          </section>

          <section className="mb-6">
            <p className="mb-2 text-sm font-medium text-slate-700">Add Text</p>
            <div className="flex gap-2">
              <input
                value={textValue}
                onChange={(event) => setTextValue(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring"
                placeholder="Type your text"
              />
              <button onClick={addText} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
                Add
              </button>
            </div>
          </section>

          <button onClick={exportDesign} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500">
            Download PNG
          </button>
        </aside>

        <section className="flex items-center justify-center rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-8">
          <div className="relative h-[440px] w-[380px] max-w-full">
            <TshirtShape color={shirtColor} style={shirtStyle} view={shirtView} />
            <div
              className="pointer-events-none absolute rounded-md border-2 border-dashed border-indigo-500/70 bg-indigo-100/20"
              style={{ top: designArea.top, left: designArea.left, width: designArea.width, height: designArea.height }}
            >
              <span className="absolute -top-6 left-0 rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white">Safe print area</span>
            </div>
            <div className="absolute overflow-hidden rounded-md" style={{ top: designArea.top, left: designArea.left, width: designArea.width, height: designArea.height }}>
              <canvas ref={canvasElRef} className="h-full w-full touch-none" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
