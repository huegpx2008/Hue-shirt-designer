import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("hue_canva_oauth_state")?.value;

  if (!code) {
    return NextResponse.json({ error: "Canva did not return an authorization code." }, { status: 400 });
  }

  if (!state || !storedState || state !== storedState) {
    return NextResponse.json({ error: "Canva authorization state did not match. Please try connecting again." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: "Canva authorization reached Hue Studio. The next implementation step is exchanging this code for a Canva access token, listing designs, exporting the selected design, and saving it to Image Zone."
  });
}
