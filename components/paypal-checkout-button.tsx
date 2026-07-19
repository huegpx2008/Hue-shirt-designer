'use client';

import { useEffect, useRef, useState } from 'react';

type PayPalButtonsInstance = { render: (element: HTMLElement) => Promise<void>; close?: () => Promise<void> };
type PayPalNamespace = {
  Buttons: (options: {
    style?: Record<string, string | boolean | number>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (error: unknown) => void;
  }) => PayPalButtonsInstance;
};

declare global { interface Window { paypal?: PayPalNamespace } }

type Props = {
  createOrder: () => Promise<string>;
  onApprove: (paypalOrderId: string) => Promise<void>;
  onCancel?: () => void;
  onError?: (message: string) => void;
  onAvailabilityChange?: (enabled: boolean) => void;
  disabled?: boolean;
};

let paypalSdkPromise: Promise<void> | null = null;

const loadSdk = (clientId: string, currency: string) => {
  if (window.paypal) return Promise.resolve();
  if (paypalSdkPromise) return paypalSdkPromise;
  paypalSdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons`;
    script.async = true;
    script.dataset.huePaypalSdk = 'true';
    script.onload = () => resolve();
    script.onerror = () => { paypalSdkPromise = null; reject(new Error('PayPal Checkout could not be loaded.')); };
    document.head.appendChild(script);
  });
  return paypalSdkPromise;
};

export default function PayPalCheckoutButton({ createOrder, onApprove, onCancel, onError, onAvailabilityChange, disabled }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ createOrder, onApprove, onCancel, onError, onAvailabilityChange });
  const [environment, setEnvironment] = useState<'sandbox' | 'live'>('sandbox');
  const [loading, setLoading] = useState(true);
  callbacksRef.current = { createOrder, onApprove, onCancel, onError, onAvailabilityChange };

  useEffect(() => {
    let active = true;
    let buttons: PayPalButtonsInstance | null = null;
    const initialize = async () => {
      try {
        const response = await fetch('/api/paypal/config', { cache: 'no-store' });
        const config = await response.json() as { enabled?: boolean; environment?: 'sandbox' | 'live'; clientId?: string; currency?: string };
        if (!active || !config.enabled || !config.clientId) {
          callbacksRef.current.onAvailabilityChange?.(false);
          setLoading(false);
          return;
        }
        setEnvironment(config.environment || 'sandbox');
        await loadSdk(config.clientId, config.currency || 'USD');
        if (!active || !containerRef.current || !window.paypal) return;
        buttons = window.paypal.Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'paypal', height: 48, tagline: false },
          createOrder: () => callbacksRef.current.createOrder(),
          onApprove: ({ orderID }) => callbacksRef.current.onApprove(orderID),
          onCancel: () => callbacksRef.current.onCancel?.(),
          onError: (error) => callbacksRef.current.onError?.(error instanceof Error ? error.message : 'PayPal Checkout encountered an error.'),
        });
        await buttons.render(containerRef.current);
        if (active) { callbacksRef.current.onAvailabilityChange?.(true); setLoading(false); }
      } catch (error) {
        if (active) {
          callbacksRef.current.onAvailabilityChange?.(false);
          callbacksRef.current.onError?.(error instanceof Error ? error.message : 'PayPal Checkout could not be loaded.');
          setLoading(false);
        }
      }
    };
    void initialize();
    return () => { active = false; if (buttons?.close) void buttons.close(); };
  }, []);

  return (
    <div className={disabled ? 'pointer-events-none opacity-55' : ''}>
      {loading ? <p className="rounded border border-slate-700 bg-slate-950/60 px-4 py-3 text-center text-xs font-bold text-slate-300">Loading secure PayPal Checkout…</p> : null}
      <div ref={containerRef} className="min-h-0 overflow-hidden rounded" />
      {!loading && environment === 'sandbox' ? <p className="mt-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">PayPal sandbox — no real money</p> : null}
    </div>
  );
}
