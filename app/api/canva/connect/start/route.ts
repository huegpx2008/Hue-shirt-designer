import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

const CANVA_AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
const DEFAULT_CANVA_SCOPES = "design:meta:read design:content:read design:permission:read profile:read";

const base64UrlEncode = (buffer: Buffer) =>
  buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

export async function GET(request: NextRequest) {
  const clientId = process.env.CANVA_CLIENT_ID;
  const redirectUri = process.env.CANVA_REDIRECT_URI;

  if (!clientId || !process.env.CANVA_CLIENT_SECRET || !redirectUri) {
    return NextResponse.json({
      error: "Canva import is not configured yet.",
      missing: ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET", "CANVA_REDIRECT_URI"].filter((name) => !process.env[name])
    }, { status: 501 });
  }

  const state = crypto.randomBytes(24).toString("hex");
  const codeVerifier = base64UrlEncode(crypto.randomBytes(64));
  const codeChallenge = base64UrlEncode(crypto.createHash("sha256").update(codeVerifier).digest());
  const authorizeUrl = new URL(CANVA_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", process.env.CANVA_SCOPES || DEFAULT_CANVA_SCOPES);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("hue_canva_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 60 * 10,
    path: "/"
  });
  response.cookies.set("hue_canva_code_verifier", codeVerifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 60 * 10,
    path: "/"
  });
  return response;
}
