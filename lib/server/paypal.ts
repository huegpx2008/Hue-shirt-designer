import { createHmac, timingSafeEqual } from 'node:crypto';

type PayPalEnvironment = 'sandbox' | 'live';

export type PayPalCheckoutToken = {
  kind: 'paypal_checkout';
  paypalOrderId: string;
  submissionKey: string;
  amount: string;
  currency: string;
  customerEmail: string;
  exp: number;
};

export type PayPalPaymentToken = {
  kind: 'paypal_payment';
  paypalOrderId: string;
  captureId: string;
  submissionKey: string;
  amount: string;
  currency: string;
  customerEmail: string;
  exp: number;
};

type PayPalOrderResponse = {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    payee?: { merchant_id?: string };
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: { currency_code?: string; value?: string };
        create_time?: string;
      }>;
    };
  }>;
};

const normalizeMoney = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('PayPal received an invalid order amount.');
  return amount.toFixed(2);
};

export const getPayPalConfig = () => {
  const environment: PayPalEnvironment = process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
  const clientId = (process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
  const signingSecret = (process.env.PAYPAL_ORDER_SIGNING_SECRET || '').trim();
  const enabled = process.env.CHECKOUT_ENABLED !== 'false'
    && process.env.PAYPAL_CHECKOUT_ENABLED === 'true'
    && Boolean(clientId && clientSecret && signingSecret);

  return {
    environment,
    clientId,
    clientSecret,
    signingSecret,
    webhookId: (process.env.PAYPAL_WEBHOOK_ID || '').trim(),
    merchantId: (process.env.PAYPAL_MERCHANT_ID || '').trim(),
    apiBase: environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
    enabled,
  };
};

const getAccessToken = async () => {
  const config = getPayPalConfig();
  if (!config.enabled) throw new Error('PayPal Checkout is not enabled.');

  const response = await fetch(`${config.apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || 'PayPal authentication failed.');
  return payload.access_token;
};

const paypalRequest = async <T>(path: string, init: RequestInit = {}) => {
  const config = getPayPalConfig();
  const accessToken = await getAccessToken();
  const response = await fetch(`${config.apiBase}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({})) as T & { message?: string; details?: Array<{ description?: string }> };
  if (!response.ok) throw new Error(payload.details?.[0]?.description || payload.message || `PayPal request failed (${response.status}).`);
  return payload;
};

export const createPayPalOrder = async (input: { submissionKey: string; amount: number; currency: string; customerEmail: string }) => {
  const value = normalizeMoney(input.amount);
  return paypalRequest<PayPalOrderResponse>('/v2/checkout/orders', {
    method: 'POST',
    headers: { 'PayPal-Request-Id': `hue-create-${input.submissionKey}`.slice(0, 108) },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: input.submissionKey,
        description: 'Hue Studio print-ready order',
        amount: { currency_code: input.currency, value },
      }],
      payer: { email_address: input.customerEmail },
      payment_source: {
        paypal: {
          experience_context: {
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
          },
        },
      },
    }),
  });
};

export const capturePayPalOrder = async (paypalOrderId: string, submissionKey: string) => paypalRequest<PayPalOrderResponse>(
  `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
  {
    method: 'POST',
    headers: { 'PayPal-Request-Id': `hue-capture-${submissionKey}`.slice(0, 108) },
    body: '{}',
  },
);

export const validateCompletedCapture = (payload: PayPalOrderResponse, expected: { paypalOrderId: string; submissionKey: string; amount: string; currency: string }) => {
  const unit = payload.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const config = getPayPalConfig();
  if (payload.id !== expected.paypalOrderId || payload.status !== 'COMPLETED' || capture?.status !== 'COMPLETED' || !capture.id) {
    throw new Error('PayPal did not return a completed payment. Your order has not been submitted.');
  }
  if (unit?.custom_id !== expected.submissionKey) throw new Error('PayPal order reference did not match this checkout.');
  if (normalizeMoney(capture.amount?.value) !== normalizeMoney(expected.amount) || capture.amount?.currency_code !== expected.currency) {
    throw new Error('PayPal captured amount did not match the verified Hue order total.');
  }
  if (config.merchantId && unit?.payee?.merchant_id !== config.merchantId) throw new Error('PayPal merchant verification failed.');
  return { captureId: capture.id, paidAt: capture.create_time || new Date().toISOString(), capture };
};

const signPayload = (encoded: string, secret: string) => createHmac('sha256', secret).update(encoded).digest('base64url');

export const createPayPalToken = <T extends PayPalCheckoutToken | PayPalPaymentToken>(payload: T) => {
  const secret = getPayPalConfig().signingSecret;
  if (!secret) throw new Error('PayPal order signing is not configured.');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signPayload(encoded, secret)}`;
};

export const verifyPayPalToken = <T extends PayPalCheckoutToken | PayPalPaymentToken>(token: string, kind: T['kind']): T => {
  const secret = getPayPalConfig().signingSecret;
  const [encoded, signature] = String(token || '').split('.');
  if (!secret || !encoded || !signature) throw new Error('The PayPal checkout session is invalid.');
  const expected = signPayload(encoded, secret);
  const valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) throw new Error('The PayPal checkout session could not be verified.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  if (payload.kind !== kind || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error('The PayPal checkout session has expired.');
  return payload;
};

export const verifyPayPalWebhook = async (request: Request, webhookEvent: unknown) => {
  const config = getPayPalConfig();
  if (!config.enabled || !config.webhookId) throw new Error('PayPal webhook verification is not configured.');
  const payload = await paypalRequest<{ verification_status?: string }>('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: request.headers.get('paypal-auth-algo'),
      cert_url: request.headers.get('paypal-cert-url'),
      transmission_id: request.headers.get('paypal-transmission-id'),
      transmission_sig: request.headers.get('paypal-transmission-sig'),
      transmission_time: request.headers.get('paypal-transmission-time'),
      webhook_id: config.webhookId,
      webhook_event: webhookEvent,
    }),
  });
  return payload.verification_status === 'SUCCESS';
};
