import { createHmac, timingSafeEqual } from 'node:crypto';

type ArtworkAccessPayload = {
  exp: number;
  path: string;
  v: 1;
};

const getSigningSecret = () => process.env.ARTWORK_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const sign = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest('base64url');

const validArtworkPath = (path: string) => path.length <= 1024
  && !path.includes('..')
  && !path.includes('\\')
  && (path.startsWith('orders/') || path.startsWith('customers/'));

export const createArtworkAccessToken = (path: string, expiresIn = 60 * 60 * 24 * 90) => {
  const secret = getSigningSecret();
  if (!secret) throw new Error('Artwork access links are not configured. Add ARTWORK_LINK_SECRET.');
  if (!validArtworkPath(path)) throw new Error('A valid artwork storage path is required.');
  const payload: ArtworkAccessPayload = {
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    path,
    v: 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded, secret)}`;
};

export const verifyArtworkAccessToken = (token: string) => {
  const secret = getSigningSecret();
  if (!secret) throw new Error('Artwork access links are not configured.');
  if (!token || token.length > 8192) throw new Error('This artwork link is invalid.');
  const [encoded, suppliedSignature, extra] = token.split('.');
  if (!encoded || !suppliedSignature || extra) throw new Error('This artwork link is invalid.');

  const expectedSignature = sign(encoded, secret);
  const supplied = Buffer.from(suppliedSignature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('This artwork link is invalid.');
  }

  let payload: ArtworkAccessPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ArtworkAccessPayload;
  } catch {
    throw new Error('This artwork link is invalid.');
  }
  if (payload.v !== 1 || !validArtworkPath(payload.path) || !Number.isFinite(payload.exp)) throw new Error('This artwork link is invalid.');
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('This artwork link has expired.');
  return payload;
};

export const createArtworkAccessUrl = (origin: string, path: string) => {
  const url = new URL('/api/orders/artwork', origin);
  url.searchParams.set('token', createArtworkAccessToken(path));
  return url.toString();
};
