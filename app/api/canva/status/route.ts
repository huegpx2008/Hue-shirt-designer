import { NextResponse } from "next/server";

const getMissingCanvaConfig = () => {
  const required = ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET", "CANVA_REDIRECT_URI"];
  return required.filter((name) => !process.env[name]);
};

export async function GET() {
  const missing = getMissingCanvaConfig();
  const configured = missing.length === 0;

  return NextResponse.json({
    configured,
    authUrl: configured ? "/api/canva/connect/start" : undefined,
    missing,
    message: configured
      ? "Canva import is ready to connect."
      : "Add Canva developer app credentials to enable customer Canva imports."
  });
}
