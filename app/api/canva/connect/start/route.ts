import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

const CANVA_AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
const DEFAULT_CANVA_SCOPES = "design:meta:read design:content:read";

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
  const authorizeUrl = new URL(CANVA_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", process.env.CANVA_SCOPES || DEFAULT_CANVA_SCOPES);
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("hue_canva_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 60 * 10,
    path: "/"
  });
  return response;
}
