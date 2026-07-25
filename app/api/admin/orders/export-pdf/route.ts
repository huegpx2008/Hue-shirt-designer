import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/server/admin-auth';
import { buildOrderReportPdf, type OrderReportRow } from '@/lib/server/order-report-pdf';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';
import { hasSupabaseAdminConfig, supabaseAdminFetch } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const validDateLabel = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
const validIsoDate = (value: unknown) => {
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const listOrders = async (fromIso: string, toIso: string) => {
  const orders: OrderReportRow[] = [];
  const pageSize = 500;
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const query = `/rest/v1/hue_orders?select=*&created_at=gte.${encodeURIComponent(fromIso)}&created_at=lt.${encodeURIComponent(toIso)}&order=created_at.asc&limit=${pageSize}&offset=${offset}`;
    const page = await supabaseAdminFetch(query) as OrderReportRow[];
    orders.push(...page);
    if (page.length < pageSize) break;
  }
  return orders;
};

export async function POST(request: NextRequest) {
  if (!verifyAdminRequest(request)) return NextResponse.json({ error: 'Admin sign-in required.' }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Cross-site exports are not allowed.' }, { status: 403 });
  if (!hasSupabaseAdminConfig()) return NextResponse.json({ error: 'Order export is temporarily unavailable.' }, { status: 503 });
  const retryAfter = enforceRateLimit(request, 'admin-order-pdf-export', 12, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many PDF exports. Please wait a moment.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 8 * 1024)) return NextResponse.json({ error: 'The export request is too large.' }, { status: 413 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const fromLabel = validDateLabel(body.fromLabel);
  const toLabel = validDateLabel(body.toLabel);
  const fromDate = validIsoDate(body.fromIso);
  const toDate = validIsoDate(body.toIso);
  if (!fromLabel || !toLabel || !fromDate || !toDate || fromDate >= toDate) return NextResponse.json({ error: 'Choose a valid beginning and ending date.' }, { status: 400 });
  if (toDate.getTime() - fromDate.getTime() > 5 * 366 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: 'Choose a date range of five years or less.' }, { status: 400 });

  try {
    const orders = await listOrders(fromDate.toISOString(), toDate.toISOString());
    const bytes = await buildOrderReportPdf({ orders, fromLabel, toLabel });
    const filename = `Hue-Studio-Orders_${fromLabel}_to_${toLabel}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The order PDF could not be generated.' }, { status: 500 });
  }
}
