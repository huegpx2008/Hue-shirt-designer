# Hue Studio PayPal Checkout Setup

PayPal is now added directly to `main` behind an environment switch. Keep it disabled until the sandbox flow is verified end to end.

## 1. Run Supabase SQL

Run `supabase/hue-studio-paypal-checkout.sql` in the Supabase SQL Editor. The main admin setup file also includes these columns/tables now, but the PayPal-only file is the smallest safe migration to run on an existing project.

## 2. Add environment variables

Start with sandbox credentials:

```env
CHECKOUT_ENABLED=true
PAYPAL_CHECKOUT_ENABLED=true
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
PAYPAL_MERCHANT_ID=
PAYPAL_ORDER_SIGNING_SECRET=at-least-32-random-characters
```

`PAYPAL_MERCHANT_ID` is optional, but recommended before live launch because it verifies the captured payment went to the expected PayPal merchant.

## 3. Configure webhook

In the PayPal developer dashboard, create a webhook pointing to:

```text
https://studio.huegraphics.cc/api/paypal/webhook
```

Subscribe to:

- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REFUNDED`
- `PAYMENT.CAPTURE.REVERSED`

Copy the webhook ID into `PAYPAL_WEBHOOK_ID`.

## 4. Test before live

Use a PayPal sandbox buyer account and submit a small order. Confirm:

- PayPal button appears in checkout.
- Payment captures successfully.
- Order appears in Hue admin with `payment_status = completed`.
- PayPal order ID and capture ID are visible in the admin order detail.
- Customer and Hue confirmation emails send.

Then switch `PAYPAL_ENV=live` and live credentials only when the final domain and webhook are ready.
