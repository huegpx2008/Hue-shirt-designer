import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

export const ADMIN_COOKIE_NAME = 'hue_admin_session';

const getAdminSecret = () => process.env.ADMIN_DASHBOARD_SECRET || '';
const getSessionSecret = () => process.env.ADMIN_SESSION_SECRET || getAdminSecret();
const sign = (value: string) => crypto.createHmac('sha256', getSessionSecret()).update(value).digest('base64url');

export const isAdminConfigured = () => Boolean(getAdminSecret());

export const verifyAdminPassword = (password: string) => {
  const expected = Buffer.from(getAdminSecret());
  const supplied = Buffer.from(password);
  return expected.length > 0 && expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};

export const verifyAdminRequest = (request: NextRequest) => {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value || '';
  if (!getSessionSecret() || !token || token.length > 2048) return false;
  const [encoded, suppliedSignature, extra] = token.split('.');
  if (!encoded || !suppliedSignature || extra) return false;
  const expectedSignature = sign(encoded);
  if (suppliedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature))) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { exp?: number; nonce?: string; v?: number };
    return payload.v === 2
      && typeof payload.nonce === 'string'
      && payload.nonce.length >= 32
      && Number.isFinite(payload.exp)
      && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

export const createAdminSessionToken = (expiresInSeconds = 60 * 60 * 4) => {
  if (!getSessionSecret()) throw new Error('Admin session signing is not configured.');
  const encoded = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    nonce: crypto.randomBytes(24).toString('hex'),
    v: 2,
  }), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
};
