import { NextResponse } from "next/server";

const getMissingCanvaConfig = () => {
  const required = ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET", "CANVA_REDIRECT_URI"];
  return required.filter((name) => !process.env[name]);
};

export async function GET() {
  const missing = getMissingCanvaConfig();
  const configured = missing.length === 0;
  const redirectUri = process.env.CANVA_REDIRECT_URI;
  const canvaOrigin = redirectUri ? new URL(redirectUri).origin : "";

  return NextResponse.json({
    configured,
    authUrl: configured ? new URL("/api/canva/connect/start", canvaOrigin).toString() : undefined,
    missing,
    message: configured
      ? "Canva import is ready to connect."
      : "Add Canva developer app credentials to enable customer Canva imports."
  });
}
