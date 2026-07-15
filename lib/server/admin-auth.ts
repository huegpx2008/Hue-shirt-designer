import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

export const ADMIN_COOKIE_NAME = 'hue_admin_session';

const getAdminSecret = () => process.env.ADMIN_DASHBOARD_SECRET || '';
const getExpectedToken = () => {
  const secret = getAdminSecret();
  return secret ? crypto.createHmac('sha256', secret).update('hue-studio-admin-v1').digest('hex') : '';
};

export const isAdminConfigured = () => Boolean(getAdminSecret());

export const verifyAdminPassword = (password: string) => {
  const expected = Buffer.from(getAdminSecret());
  const supplied = Buffer.from(password);
  return expected.length > 0 && expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};

export const verifyAdminRequest = (request: NextRequest) => {
  const supplied = request.cookies.get(ADMIN_COOKIE_NAME)?.value || '';
  const expected = getExpectedToken();
  if (!supplied || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
};

export const createAdminSessionToken = () => getExpectedToken();

