import { NextResponse } from "next/server";

const screenprintPricingApiUrl =
  "https://quotes.huegraphics.cc/api/pricing/screenprint";

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    const response = await fetch(screenprintPricingApiUrl, {
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
              "We could not load this screen printing estimate right now. Please try again or request a quote.",
          },
        };

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The screen printing pricing API could not be reached.";

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
