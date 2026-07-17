import { NextResponse } from "next/server";
import { applyStudioPricingAdjustment } from '@/lib/server/studio-pricing';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';

const embroideryPricingApiUrl =
  "https://quotes.huegraphics.cc/api/pricing/embroidery";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ ok: false, error: { message: 'This pricing request came from an untrusted site.' } }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'pricing-embroidery', 120, 60 * 1000);
  if (retryAfter) return NextResponse.json({ ok: false, error: { message: 'Too many pricing requests. Please wait and try again.' } }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 64 * 1024)) return NextResponse.json({ ok: false, error: { message: 'The pricing request is too large.' } }, { status: 413 });
  try {
    const payload = await request.json();

    const response = await fetch(embroideryPricingApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : {
          ok: false,
          error: {
            message:
              (await response.text()) ||
              "We could not load this embroidery estimate right now. Please try again or request a quote.",
          },
        };

    const studioData = response.ok ? await applyStudioPricingAdjustment(data, 'embroidery') : data;
    return NextResponse.json(studioData, { status: response.status });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The embroidery pricing API could not be reached.";

    return NextResponse.json(
      {
        ok: false,
        error: {
          message,
        },
      },
      { status: 502 },
    );
  }
}
