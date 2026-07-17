import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { validateArtworkBuffer } from '@/lib/server/artwork-file-validation';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const VALID_ACTIONS = new Set(['restore', 'remove-background', 'remove', 'background', 'recolor', 'replace']);

const signCloudinary = (parameters: Record<string, string>, secret: string) => {
  const payload = Object.entries(parameters).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('&');
  return createHash('sha1').update(`${payload}${secret}`).digest('hex');
};

const encodePrompt = (value: string) => encodeURIComponent(value.trim()).replace(/%20/g, '%20');

const buildTransformation = (action: string, prompt: string, targetColor: string) => {
  if (action === 'restore') return 'e_gen_restore/e_improve:indoor:35';
  if (action === 'remove-background') return 'e_background_removal';
  if (action === 'remove') return `e_gen_remove:prompt_${encodePrompt(prompt)}`;
  if (action === 'background') return `e_gen_background_replace:prompt_${encodePrompt(prompt)}`;
  if (action === 'recolor') return `e_gen_recolor:prompt_${encodePrompt(prompt)};to-color_${targetColor.replace('#', '')}`;
  const [from, to] = prompt.split('=>').map((part) => part.trim());
  return `e_gen_replace:from_${encodePrompt(from)};to_${encodePrompt(to)};preserve-geometry_true`;
};

const destroyTemporaryAsset = async (cloudName: string, apiKey: string, apiSecret: string, publicId: string) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const parameters = { invalidate: 'true', public_id: publicId, timestamp };
  const form = new FormData();
  Object.entries(parameters).forEach(([key, value]) => form.append(key, value));
  form.append('api_key', apiKey);
  form.append('signature', signCloudinary(parameters, apiSecret));
  await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, { method: 'POST', body: form });
};

export async function POST(request: Request) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Cloudinary AI is connected, but CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be added to the server.' }, { status: 503 });
  }

  let temporaryPublicId = '';
  try {
    const incoming = await request.formData();
    const image = incoming.get('image');
    const prompt = String(incoming.get('prompt') || '').trim();
    const action = String(incoming.get('action') || 'restore');
    const targetColor = String(incoming.get('targetColor') || '#0ea5e9');

    if (!(image instanceof File)) return NextResponse.json({ error: 'Choose a valid image before running Cloudinary AI.' }, { status: 400 });
    if (image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'The selected image is larger than the 10 MB Cloudinary limit on your current plan.' }, { status: 413 });
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const validatedImage = validateArtworkBuffer(imageBuffer, { maxBytes: MAX_IMAGE_BYTES });
    if (!VALID_ACTIONS.has(action)) return NextResponse.json({ error: 'Choose a supported Cloudinary edit action.' }, { status: 400 });
    if (!['restore', 'remove-background'].includes(action) && (prompt.length < 2 || prompt.length > 500)) return NextResponse.json({ error: 'Describe the target in 2 to 500 characters.' }, { status: 400 });
    if (action === 'replace' && !prompt.includes('=>')) return NextResponse.json({ error: 'For replacement, use “what to replace => what should replace it”.' }, { status: 400 });
    if (action === 'recolor' && !/^#[0-9a-f]{6}$/i.test(targetColor)) return NextResponse.json({ error: 'Choose a valid recolor target.' }, { status: 400 });

    const timestamp = String(Math.floor(Date.now() / 1000));
    const uploadId = `hue-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const uploadParameters = { folder: 'hue-ai-temporary', public_id: uploadId, timestamp };
    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([imageBuffer], { type: validatedImage.mimeType }), image.name || `artwork.${validatedImage.extension}`);
    Object.entries(uploadParameters).forEach(([key, value]) => uploadForm.append(key, value));
    uploadForm.append('api_key', apiKey);
    uploadForm.append('signature', signCloudinary(uploadParameters, apiSecret));
    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: uploadForm });
    const uploadResult = await uploadResponse.json() as { public_id?: string; format?: string; error?: { message?: string } };
    if (!uploadResponse.ok || !uploadResult.public_id) throw new Error(uploadResult.error?.message || 'Cloudinary could not upload the temporary source image.');
    temporaryPublicId = uploadResult.public_id;

    const transformation = buildTransformation(action, prompt, targetColor);
    const publicPath = temporaryPublicId.split('/').map(encodeURIComponent).join('/');
    const outputUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${transformation}/f_png,q_auto/${publicPath}.${uploadResult.format || 'png'}`;
    let transformedResponse: Response | null = null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      transformedResponse = await fetch(outputUrl, { cache: 'no-store' });
      if (transformedResponse.ok) break;
      if (![420, 423].includes(transformedResponse.status)) {
        const message = await transformedResponse.text();
        throw new Error(message.slice(0, 300) || `Cloudinary transformation failed (${transformedResponse.status}).`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!transformedResponse?.ok) throw new Error('Cloudinary is still processing this edit. Try again in a moment.');
    const output = Buffer.from(await transformedResponse.arrayBuffer());
    return NextResponse.json({ imageDataUrl: `data:image/png;base64,${output.toString('base64')}`, provider: 'cloudinary', action });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Cloudinary AI Edit failed unexpectedly.' }, { status: 500 });
  } finally {
    if (temporaryPublicId && cloudName && apiKey && apiSecret) {
      try { await destroyTemporaryAsset(cloudName, apiKey, apiSecret, temporaryPublicId); } catch { /* Temporary assets can be cleared from the hue-ai-temporary folder if cleanup is interrupted. */ }
    }
  }
}
