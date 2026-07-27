export type TurnaroundTier = 'standard' | 'large' | 'very_large';

export type TurnaroundOrderItem = {
  mode?: string;
  productId?: string;
  quantity?: number;
  price?: { sheetCount?: number };
  pricingRequest?: { payload?: Record<string, string | number | boolean> };
};

export type TurnaroundEstimate = {
  tier: TurnaroundTier;
  tierLabel: string;
  cutoffTime: string;
  timezone: string;
  minBusinessDays: number;
  maxBusinessDays: number;
  windowStart: string;
  windowEnd: string;
  windowLabel: string;
  fulfillmentLabel: string;
  explanation: string;
  workload: { productionSheets: number; bannerSquareFeet: number; apparelPieces: number };
  calculatedAt: string;
};

const TIMEZONE = 'America/New_York';
const CUTOFF_HOUR = 14;

const easternParts = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)])) as Record<string, number>;

const easternCalendarDate = (date: Date) => {
  const parts = easternParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
};

const isBusinessDay = (date: Date) => {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
};

const nextBusinessDay = (date: Date) => {
  const next = new Date(date);
  do next.setUTCDate(next.getUTCDate() + 1); while (!isBusinessDay(next));
  return next;
};

const addBusinessDays = (date: Date, days: number) => {
  let cursor = new Date(date);
  let remaining = Math.max(0, Math.floor(days));
  while (remaining > 0) {
    cursor = nextBusinessDay(cursor);
    remaining -= 1;
  }
  return cursor;
};

const isoCalendarDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const formatWindow = (start: Date, end: Date) => {
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  const monthDay = (date: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(date);
  if (sameMonth) return `${monthDay(start)}–${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  if (sameYear) return `${monthDay(start)}–${monthDay(end)}, ${end.getUTCFullYear()}`;
  return `${monthDay(start)}, ${start.getUTCFullYear()}–${monthDay(end)}, ${end.getUTCFullYear()}`;
};

const finite = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const getTurnaroundWorkload = (items: TurnaroundOrderItem[]) => items.reduce((workload, item) => {
  const quantity = Math.max(0, Math.floor(finite(item.quantity)));
  const sheetCount = Math.max(0, Math.ceil(finite(item.price?.sheetCount)));
  workload.productionSheets += sheetCount;
  if (item.productId === 'banner' || item.productId === 'mesh-banner') {
    const width = finite(item.pricingRequest?.payload?.width);
    const height = finite(item.pricingRequest?.payload?.height);
    workload.bannerSquareFeet += Math.max(0, (width * height * Math.max(1, quantity)) / 144);
  }
  if (item.mode === 'apparel' || String(item.productId || '').startsWith('shop-')) workload.apparelPieces += quantity;
  return workload;
}, { productionSheets: 0, bannerSquareFeet: 0, apparelPieces: 0 });

export const estimateTurnaround = (
  items: TurnaroundOrderItem[],
  fulfillment: 'pickup' | 'direct_ship' = 'pickup',
  placedAt = new Date(),
): TurnaroundEstimate => {
  const workload = getTurnaroundWorkload(items);
  const veryLarge = workload.productionSheets > 10 || workload.bannerSquareFeet > 500 || workload.apparelPieces > 100;
  const large = workload.productionSheets > 5 || workload.bannerSquareFeet > 250 || workload.apparelPieces > 50;
  const tier: TurnaroundTier = veryLarge ? 'very_large' : large ? 'large' : 'standard';
  const [minBusinessDays, maxBusinessDays] = tier === 'very_large' ? [4, 7] : tier === 'large' ? [3, 5] : [2, 3];
  const parts = easternParts(placedAt);
  let startingDay = easternCalendarDate(placedAt);
  if (!isBusinessDay(startingDay) || parts.hour >= CUTOFF_HOUR) startingDay = nextBusinessDay(startingDay);
  const windowStart = addBusinessDays(startingDay, minBusinessDays);
  const windowEnd = addBusinessDays(startingDay, maxBusinessDays);
  const tierLabel = tier === 'very_large' ? 'Very large production order' : tier === 'large' ? 'Large production order' : 'Standard production order';
  return {
    tier,
    tierLabel,
    cutoffTime: '2:00 PM ET',
    timezone: TIMEZONE,
    minBusinessDays,
    maxBusinessDays,
    windowStart: isoCalendarDate(windowStart),
    windowEnd: isoCalendarDate(windowEnd),
    windowLabel: formatWindow(windowStart, windowEnd),
    fulfillmentLabel: fulfillment === 'direct_ship' ? 'Estimated delivery' : 'Estimated ready for pickup',
    explanation: tier === 'standard'
      ? 'Based on print-ready artwork. This is an estimate, not a guaranteed completion date.'
      : `${tierLabel}: additional production time is already included in this estimate. Artwork changes may extend the window.`,
    workload,
    calculatedAt: placedAt.toISOString(),
  };
};
