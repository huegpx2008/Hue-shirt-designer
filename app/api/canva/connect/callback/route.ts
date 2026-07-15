import { NextRequest, NextResponse } from "next/server";

const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("hue_canva_oauth_state")?.value;
  const codeVerifier = request.cookies.get("hue_canva_code_verifier")?.value;
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  const redirectUri = process.env.CANVA_REDIRECT_URI;

  if (!code) {
    return NextResponse.json({ error: "Canva did not return an authorization code." }, { status: 400 });
  }

  if (!state || !storedState || state !== storedState) {
    return NextResponse.json({ error: "Canva authorization state did not match. Please try connecting again." }, { status: 400 });
  }

  if (!clientId || !clientSecret || !redirectUri || !codeVerifier) {
    return NextResponse.json({ error: "Canva authorization could not continue because the server connection details were incomplete. Please start the Canva connection again." }, { status: 400 });
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  const tokenResponse = await fetch(CANVA_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    return NextResponse.json({
      error: "Canva approved the connection, but Hue Studio could not finish creating the Canva session.",
      details: errorText.slice(0, 600)
    }, { status: tokenResponse.status });
  }

  const tokenPayload = await tokenResponse.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokenPayload.access_token) {
    return NextResponse.json({ error: "Canva did not return an access token." }, { status: 502 });
  }

  const redirectTarget = new URL("/", request.nextUrl.origin);
  redirectTarget.searchParams.set("canva", "connected");

  const response = NextResponse.redirect(redirectTarget);
  const secure = request.nextUrl.protocol === "https:";
  response.cookies.set("hue_canva_access_token", tokenPayload.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: Math.max(60, Math.min(tokenPayload.expires_in || 3600, 3600)),
    path: "/"
  });
  if (tokenPayload.refresh_token) {
    response.cookies.set("hue_canva_refresh_token", tokenPayload.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 60 * 60 * 24 * 30,
      path: "/"
    });
  }
  response.cookies.delete("hue_canva_oauth_state");
  response.cookies.delete("hue_canva_code_verifier");
  return response;
}
