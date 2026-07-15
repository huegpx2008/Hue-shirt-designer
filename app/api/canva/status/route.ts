import { NextRequest, NextResponse } from "next/server";

const getMissingCanvaConfig = () => {
  const required = ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET", "CANVA_REDIRECT_URI"];
  return required.filter((name) => !process.env[name]);
};

export async function GET(request: NextRequest) {
  const missing = getMissingCanvaConfig();
  const configured = missing.length === 0;
  const connected = Boolean(request.cookies.get("hue_canva_access_token")?.value);
  const redirectUri = process.env.CANVA_REDIRECT_URI;
  const canvaOrigin = redirectUri ? new URL(redirectUri).origin : "";

  return NextResponse.json({
    configured,
    connected,
    authUrl: configured ? new URL("/api/canva/connect/start", canvaOrigin).toString() : undefined,
    missing,
    message: connected
      ? "Canva is connected. Choose a design to import."
      : configured
      ? "Canva import is ready to connect."
      : "Add Canva developer app credentials to enable customer Canva imports."
  });
}
