import { NextResponse } from "next/server";

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

    return NextResponse.json(data, { status: response.status });
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
