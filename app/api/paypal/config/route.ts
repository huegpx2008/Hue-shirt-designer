import { NextResponse } from 'next/server';
import { getPayPalConfig } from '@/lib/server/paypal';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getPayPalConfig();
  return NextResponse.json({
    enabled: config.enabled,
    environment: config.environment,
    clientId: config.enabled ? config.clientId : '',
    currency: 'USD',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
