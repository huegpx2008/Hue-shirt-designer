'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { FabricImage, Canvas, IText } from 'fabric';
import { SHIRT_COLORS, ShirtColorValue } from '@/components/color-options';
import TshirtShape from '@/components/tshirt-shape';

const DESIGN_AREA = { width: 220, height: 240 };

export default function Home() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const [shirtColor, setShirtColor] = useState<ShirtColorValue>(SHIRT_COLORS[0].value);
  const [textValue, setTextValue] = useState('Your text');

  useEffect(() => {
    const canvasEl = canvasElRef.current;
    if (!canvasEl) return;

    const fabricCanvas = new Canvas(canvasEl, {
      width: DESIGN_AREA.width,
      height: DESIGN_AREA.height,
      backgroundColor: 'transparent',
      preserveObjectStacking: true
    });

    fabricCanvasRef.current = fabricCanvas;

    return () => {
      fabricCanvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []);

  const addText = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const text = new IText(textValue.trim() || 'Your text', {
      left: DESIGN_AREA.width / 2,
      top: DESIGN_AREA.height / 2,
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
        left: DESIGN_AREA.width / 2,
        top: DESIGN_AREA.height / 2,
        originX: 'center',
        originY: 'center'
      });

      const maxWidth = 150;
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
    link.download = 'tshirt-design.png';
    link.href = dataUrl;
    link.click();
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
      <h1 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">Hue T-shirt Designer</h1>

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
          <h2 className="mb-4 text-lg font-medium">Editor</h2>

          <section className="mb-6">
            <p className="mb-2 text-sm font-medium text-slate-700">Shirt Color</p>
            <div className="flex flex-wrap gap-2">
              {SHIRT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setShirtColor(color.value)}
                  className={`h-9 w-9 rounded-full border-2 transition ${
                    shirtColor === color.value ? 'border-slate-900 scale-105' : 'border-slate-300'
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
            <TshirtShape color={shirtColor} />
            <div
              className="absolute left-1/2 top-[132px] -translate-x-1/2 overflow-hidden rounded-md"
              style={{ width: DESIGN_AREA.width, height: DESIGN_AREA.height }}
            >
              <canvas ref={canvasElRef} className="h-full w-full touch-none" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
