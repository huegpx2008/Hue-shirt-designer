import { NextRequest, NextResponse } from "next/server";

const getMissingCanvaConfig = () => {
  const required = ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET", "CANVA_REDIRECT_URI"];
  return required.filter((name) => !process.env[name]);
};

export async function GET(request: NextRequest) {
  const missing = getMissingCanvaConfig();
  const redirectUri = process.env.CANVA_REDIRECT_URI;
  const expectedRedirectUri = new URL("/api/canva/connect/callback", request.nextUrl.origin).toString();
  let redirectMatchesOrigin = false;
  if (redirectUri) {
    try {
      redirectMatchesOrigin = new URL(redirectUri).toString() === expectedRedirectUri;
    } catch {
      redirectMatchesOrigin = false;
    }
  }
  const configured = missing.length === 0 && redirectMatchesOrigin;
  const connected = configured && Boolean(request.cookies.get("hue_canva_access_token")?.value);

  return NextResponse.json({
    configured,
    connected,
    authUrl: configured ? new URL("/api/canva/connect/start", request.nextUrl.origin).toString() : undefined,
    missing,
    expectedRedirectUri: redirectMatchesOrigin ? undefined : expectedRedirectUri,
    message: connected
      ? "Canva is connected. Choose a design to import."
      : configured
      ? "Canva import is ready to connect."
      : missing.length === 0
      ? `CANVA_REDIRECT_URI must be ${expectedRedirectUri} for this Hue Studio address. Add that same URL to the Canva developer app's authorized redirect URLs.`
      : "Add Canva developer app credentials to enable customer Canva imports."
  });
}
