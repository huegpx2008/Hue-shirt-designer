export const MAX_ARTWORK_BYTES = 150 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 25 * 1024 * 1024;
// Large-format artwork can legitimately be very tall. The byte and per-side
// limits still bound uploads, while this ceiling accepts files such as a
// 10,050 x 24,000 production JPEG without allowing unbounded dimensions.
export const MAX_IMAGE_PIXELS = 300_000_000;
// Production JPEG originals are stored untouched in B2 and are only inspected
// by their file header on the verification route. They can safely exceed the
// decode limit used for server-generated images because the browser creates a
// 2,400px working preview before the original is accepted.
export const MAX_PRODUCTION_JPEG_PIXELS = 1_000_000_000;
export const MAX_IMAGE_DIMENSION = 50_000;

export type ValidatedArtworkFile = {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf' | 'application/json';
  extension: 'png' | 'jpg' | 'webp' | 'gif' | 'pdf' | 'json';
  width?: number;
  height?: number;
};

const startsWith = (buffer: Buffer, bytes: number[]) => bytes.every((value, index) => buffer[index] === value);
const ascii = (buffer: Buffer, start: number, length: number) => buffer.subarray(start, start + length).toString('ascii');

const readJpegDimensions = (buffer: Buffer) => {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error('The JPEG dimensions could not be verified.');
};

const readWebpDimensions = (buffer: Buffer) => {
  // A WebP RIFF can contain metadata chunks before VP8/VP8L/VP8X. Walk the
  // chunk table instead of assuming image data always begins at byte 12.
  let chunkOffset = 12;
  while (chunkOffset + 8 <= buffer.length) {
    const kind = ascii(buffer, chunkOffset, 4);
    const chunkLength = buffer.readUInt32LE(chunkOffset + 4);
    const dataOffset = chunkOffset + 8;
    const chunkEnd = dataOffset + chunkLength;
    if (chunkEnd > buffer.length) break;

    if (kind === 'VP8X' && chunkLength >= 10) {
      return {
        width: 1 + buffer.readUIntLE(dataOffset + 4, 3),
        height: 1 + buffer.readUIntLE(dataOffset + 7, 3),
      };
    }
    if (kind === 'VP8L' && chunkLength >= 5 && buffer[dataOffset] === 0x2f) {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (kind === 'VP8 ' && chunkLength >= 10) {
      const syncLimit = Math.min(chunkEnd - 7, dataOffset + 16);
      for (let syncOffset = dataOffset; syncOffset <= syncLimit; syncOffset += 1) {
        if (!startsWith(buffer.subarray(syncOffset), [0x9d, 0x01, 0x2a])) continue;
        return {
          width: buffer.readUInt16LE(syncOffset + 3) & 0x3fff,
          height: buffer.readUInt16LE(syncOffset + 5) & 0x3fff,
        };
      }
    }

    chunkOffset = chunkEnd + (chunkLength % 2);
  }
  throw new Error('The WebP dimensions could not be verified.');
};

const validateDimensions = (width: number, height: number, maxImagePixels: number) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('The image dimensions are invalid.');
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) throw new Error(`Artwork cannot exceed ${MAX_IMAGE_DIMENSION.toLocaleString()} pixels on either side.`);
  if (width * height > maxImagePixels) throw new Error(`Artwork cannot exceed ${maxImagePixels.toLocaleString()} total pixels.`);
};

export const validateArtworkBuffer = (
  buffer: Buffer,
  options: { allowPdf?: boolean; allowJson?: boolean; maxBytes?: number; maxImagePixels?: number } = {},
): ValidatedArtworkFile => {
  if (!buffer.length) throw new Error('The uploaded file is empty.');
  const maxBytes = options.maxBytes || MAX_ARTWORK_BYTES;
  if (buffer.length > maxBytes) throw new Error(`The uploaded file exceeds the ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit.`);

  let result: ValidatedArtworkFile;
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && buffer.length >= 24) {
    result = { mimeType: 'image/png', extension: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } else if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    result = { mimeType: 'image/jpeg', extension: 'jpg', ...readJpegDimensions(buffer) };
  } else if ((ascii(buffer, 0, 6) === 'GIF87a' || ascii(buffer, 0, 6) === 'GIF89a') && buffer.length >= 10) {
    result = { mimeType: 'image/gif', extension: 'gif', width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  } else if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 4) === 'WEBP') {
    result = { mimeType: 'image/webp', extension: 'webp', ...readWebpDimensions(buffer) };
  } else if (ascii(buffer, 0, 5) === '%PDF-') {
    if (!options.allowPdf) throw new Error('PDF files are not allowed for this upload.');
    const tail = buffer.subarray(Math.max(0, buffer.length - 4096)).toString('latin1');
    if (!tail.includes('%%EOF')) throw new Error('The PDF appears incomplete or damaged.');
    result = { mimeType: 'application/pdf', extension: 'pdf' };
  } else if (options.allowJson) {
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      const value = JSON.parse(decoded) as unknown;
      if (!value || typeof value !== 'object') throw new Error('invalid project');
      result = { mimeType: 'application/json', extension: 'json' };
    } catch {
      throw new Error('The Hue Designer project file is not valid JSON.');
    }
  } else {
    throw new Error('Unsupported file. Upload a genuine PNG, JPG, WebP, GIF, or PDF file. SVG and executable files are not accepted.');
  }

  if (result.width && result.height) validateDimensions(result.width, result.height, options.maxImagePixels || MAX_IMAGE_PIXELS);
  return result;
};

export const safeArtworkBaseName = (name: string) => {
  const withoutExtension = name.replace(/\.[^.]+$/, '');
  const clean = withoutExtension.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return clean || 'artwork';
};
