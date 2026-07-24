import 'server-only';

import type { ProductionArtworkRecipe } from '@/lib/production-artwork';

const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value);
const byteLength = (value: string) => bytes(value).byteLength;
const pdfNumber = (value: number) => Number(value.toFixed(4)).toString();

export type JpegInfo = { width: number; height: number; components: 1 | 3 | 4 };

export const readJpegInfo = (input: Uint8Array): JpegInfo => {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) throw new Error('The production source is not a JPEG file.');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let offset = 2;
  while (offset + 9 < input.length) {
    if (input[offset] !== 0xff) { offset += 1; continue; }
    const marker = input[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    if (offset + 4 > input.length) break;
    const length = view.getUint16(offset + 2, false);
    if (length < 2 || offset + 2 + length > input.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const components = input[offset + 9];
      if (components !== 1 && components !== 3 && components !== 4) throw new Error(`JPEG color components (${components}) are not supported for automatic production PDF generation.`);
      return { height: view.getUint16(offset + 5, false), width: view.getUint16(offset + 7, false), components };
    }
    offset += 2 + length;
  }
  throw new Error('The JPEG dimensions could not be read from the production source.');
};

const streamFromParts = (prefix: Uint8Array, source: ReadableStream<Uint8Array>, suffix: Uint8Array) => {
  const reader = source.getReader();
  let sentPrefix = false;
  let sentSuffix = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentPrefix) {
        sentPrefix = true;
        controller.enqueue(prefix);
        return;
      }
      const result = await reader.read();
      if (!result.done) {
        controller.enqueue(result.value);
        return;
      }
      if (!sentSuffix) {
        sentSuffix = true;
        controller.enqueue(suffix);
        controller.close();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
};

export const createJpegPlacementPdfStream = (args: {
  jpegStream: ReadableStream<Uint8Array>;
  jpegSize: number;
  jpeg: JpegInfo;
  recipe: ProductionArtworkRecipe;
}) => {
  const pageWidth = args.recipe.artboardWidthInches * 72;
  const pageHeight = args.recipe.artboardHeightInches * 72;
  const placement = args.recipe.placement;
  const drawWidth = placement.width * pageWidth;
  const drawHeight = placement.height * pageHeight;
  const drawX = placement.x * pageWidth;
  const drawY = pageHeight - ((placement.y + placement.height) * pageHeight);
  const colorSpace = args.jpeg.components === 1 ? '/DeviceGray' : args.jpeg.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
  const decode = args.jpeg.components === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
  const content = `q\n0 0 ${pdfNumber(pageWidth)} ${pdfNumber(pageHeight)} re W n\n${pdfNumber(drawWidth)} 0 0 ${pdfNumber(drawHeight)} ${pdfNumber(drawX)} ${pdfNumber(drawY)} cm\n/Im0 Do\nQ\n`;

  const chunks: string[] = ['%PDF-1.4\n%HUE-STUDIO\n'];
  const offsets = [0];
  let offset = byteLength(chunks[0]);
  const addObject = (objectNumber: number, body: string) => {
    offsets[objectNumber] = offset;
    const value = `${objectNumber} 0 obj\n${body}\nendobj\n`;
    chunks.push(value);
    offset += byteLength(value);
  };
  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(pageWidth)} ${pdfNumber(pageHeight)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);

  offsets[4] = offset;
  const imagePrefix = `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${args.jpeg.width} /Height ${args.jpeg.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode${decode} /Length ${args.jpegSize} >>\nstream\n`;
  chunks.push(imagePrefix);
  offset += byteLength(imagePrefix) + args.jpegSize;
  const imageSuffix = '\nendstream\nendobj\n';
  chunks.push(imageSuffix);
  offset += byteLength(imageSuffix);

  offsets[5] = offset;
  const contentObject = `5 0 obj\n<< /Length ${byteLength(content)} >>\nstream\n${content}endstream\nendobj\n`;
  chunks.push(contentObject);
  offset += byteLength(contentObject);
  const xrefOffset = offset;
  const xref = `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((entry) => `${String(entry).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const beforeImage = bytes(chunks.slice(0, 5).join(''));
  const afterImage = bytes(chunks.slice(5).join('') + xref);
  return {
    stream: streamFromParts(beforeImage, args.jpegStream, afterImage),
    size: beforeImage.byteLength + args.jpegSize + afterImage.byteLength,
    pageWidthPoints: pageWidth,
    pageHeightPoints: pageHeight,
  };
};
