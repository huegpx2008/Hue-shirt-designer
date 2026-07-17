import { createHash } from 'node:crypto';

type RateRecord = { count: number; resetAt: number };

declare global {
  var __hueRateLimits: Map<string, RateRecord> | undefined;
}

const rateLimits = globalThis.__hueRateLimits || new Map<string, RateRecord>();
globalThis.__hueRateLimits = rateLimits;

const requestIp = (request: Request) => (
  request.headers.get('x-vercel-forwarded-for')
  || request.headers.get('x-forwarded-for')?.split(',')[0]
  || request.headers.get('x-real-ip')
  || 'unknown'
).trim().slice(0, 120);

const fingerprint = (request: Request) => createHash('sha256')
  .update(`${requestIp(request)}|${request.headers.get('user-agent') || ''}`)
  .digest('hex')
  .slice(0, 24);

export const enforceRateLimit = (
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
) => {
  const now = Date.now();
  if (rateLimits.size > 5000) {
    for (const [entryKey, entry] of rateLimits) {
      if (entry.resetAt <= now) rateLimits.delete(entryKey);
    }
  }
  if (rateLimits.size > 10000) {
    for (const entryKey of Array.from(rateLimits.keys()).slice(0, 1000)) rateLimits.delete(entryKey);
  }
  const key = `${scope}:${fingerprint(request)}`;
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  current.count += 1;
  if (current.count <= limit) return null;
  return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
};

export const isSameOriginMutation = (request: Request) => {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
};

export const contentLengthExceeds = (request: Request, maxBytes: number) => {
  const value = Number(request.headers.get('content-length') || 0);
  return Number.isFinite(value) && value > maxBytes;
};
