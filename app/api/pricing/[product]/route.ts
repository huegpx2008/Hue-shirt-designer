import { NextResponse } from "next/server";
import { applyStudioPricingAdjustment } from '@/lib/server/studio-pricing';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';

const allowedProducts = new Set([
  "banner",
  "mesh-banner",
  "yard-sign",
  "acm",
  "poster",
  "acrylic",
  "foamcore",
  "pvc",
  "polystyrene",
  "aluminum",
  "vinyl",
  "custom-cut-coroplast",
  "vehicle-magnet",
  "business-card",
  "handheld-paper",
  "carbonless",
  "door-hanger",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ product: string }> },
) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ ok: false, error: { message: 'This pricing request came from an untrusted site.' } }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'pricing', 120, 60 * 1000);
  if (retryAfter) return NextResponse.json({ ok: false, error: { message: 'Too many pricing requests. Please wait and try again.' } }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 64 * 1024)) return NextResponse.json({ ok: false, error: { message: 'The pricing request is too large.' } }, { status: 413 });
  const { product } = await context.params;

  if (!allowedProducts.has(product)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "That pricing product is not available yet.",
        },
      },
      { status: 404 },
    );
  }

  try {
    const payload = await request.json();
    const response = await fetch(
      `https://quotes.huegraphics.cc/api/pricing/${product}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );

    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : {
          ok: false,
          error: {
            message:
              (await response.text()) ||
              "The pricing API returned an unexpected response.",
          },
        };

    const studioData = response.ok ? await applyStudioPricingAdjustment(data, product) : data;
    return NextResponse.json(studioData, { status: response.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The pricing API could not be reached.";

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
