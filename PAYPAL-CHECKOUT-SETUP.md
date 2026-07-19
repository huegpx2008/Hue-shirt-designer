# Hue Studio PayPal Checkout Setup

Hue Studio uses PayPal's server-side Orders API. The storefront sends the cart to Hue's server, Hue recalculates the authoritative price, PayPal captures that exact total, and only then is the production order submitted.

## 1. Prepare the database

Run `supabase/hue-studio-paypal-checkout.sql` once in the Hue Studio Supabase SQL Editor. It is safe to run again.

This creates the private payment-attempt ledger and adds payment reconciliation fields to `hue_orders`.

## 2. Create a PayPal sandbox app

In the PayPal Developer Dashboard:

1. Create or select a sandbox REST app.
2. Copy its sandbox client ID and secret.
3. Create a sandbox personal buyer account for checkout testing.
4. Keep all sandbox credentials separate from future live credentials.

## 3. Configure the webhook

Create a webhook for:

`https://YOUR-PREVIEW-DOMAIN/api/paypal/webhook`

Subscribe to:

- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REFUNDED`
- `PAYMENT.CAPTURE.REVERSED`

Copy the resulting webhook ID.

## 4. Add Vercel Preview environment variables

Add these to the Preview environment first:

```env
CHECKOUT_ENABLED=true
PAYPAL_CHECKOUT_ENABLED=true
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
PAYPAL_WEBHOOK_ID=your_sandbox_webhook_id
PAYPAL_MERCHANT_ID=
PAYPAL_ORDER_SIGNING_SECRET=generate_a_long_unique_random_secret
NEXT_PUBLIC_SITE_URL=https://YOUR-PREVIEW-DOMAIN
```

`PAYPAL_CLIENT_SECRET` and `PAYPAL_ORDER_SIGNING_SECRET` are server-only secrets. Never give either variable a `NEXT_PUBLIC_` prefix.

`PAYPAL_MERCHANT_ID` is optional but recommended. When present, Hue verifies that PayPal assigned the payment to that merchant.

## 5. Sandbox acceptance test

1. Redeploy the feature branch after adding the variables.
2. Add a normal product with artwork to the cart.
3. Continue through the checkout review.
4. Confirm the page says `PayPal sandbox — no real money`.
5. Pay with the sandbox buyer account.
6. Verify that the confirmation page shows the order.
7. Verify in Studio Admin that the order shows `PayPal · completed`, a PayPal order ID, a capture ID, and a paid time.
8. Verify both Hue and the customer receive the expected emails.
9. Attempt a refresh/retry and confirm it does not create a second Hue order or second PayPal capture.

## Emergency switches

- Set `PAYPAL_CHECKOUT_ENABLED=false` and redeploy to disable only PayPal.
- Set `CHECKOUT_ENABLED=false` and redeploy to pause all new checkout submissions.

The storefront does not fall back to a free order when PayPal is enabled but unavailable.

## Live cutover later

Do not reuse sandbox credentials. Create a live PayPal app and live webhook, then replace the Vercel Production variables with live values and set `PAYPAL_ENV=live`. Complete PayPal's production-readiness checks, verify the final domain and webhook URL, then place and refund one small real transaction before opening checkout to customers.
