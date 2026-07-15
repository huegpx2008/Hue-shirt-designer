import { NextRequest, NextResponse } from "next/server";

const CANVA_DESIGNS_URL = "https://api.canva.com/rest/v1/designs";

type CanvaRecord = Record<string, unknown>;

const getNestedString = (value: unknown, path: string[]) => {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return "";
    current = (current as CanvaRecord)[key];
  }
  return typeof current === "string" ? current : "";
};

const getDesignId = (item: CanvaRecord) =>
  String(item.id || item.design_id || getNestedString(item.design, ["id"]) || getNestedString(item.design, ["design_id"]) || "");

const getDesignTitle = (item: CanvaRecord, index: number) =>
  String(item.title || item.name || getNestedString(item.design, ["title"]) || getNestedString(item.design, ["name"]) || `Canva Design ${index + 1}`);

const getThumbnailUrl = (item: CanvaRecord) =>
  getNestedString(item, ["thumbnail", "url"]) ||
  getNestedString(item, ["thumbnail", "download_url"]) ||
  getNestedString(item, ["urls", "thumbnail"]) ||
  getNestedString(item, ["preview", "url"]) ||
  getNestedString(item, ["design", "thumbnail", "url"]) ||
  (typeof item.thumbnail_url === "string" ? item.thumbnail_url : "");

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("hue_canva_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Canva is not connected yet." }, { status: 401 });
  }

  const response = await fetch(CANVA_DESIGNS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });

  if (!response.ok) {
    const details = await response.text();
    return NextResponse.json({
      error: "Canva designs could not be loaded.",
      details: details.slice(0, 700)
    }, { status: response.status });
  }

  const payload = await response.json() as CanvaRecord;
  const rawItems =
    Array.isArray(payload.items) ? payload.items :
    Array.isArray(payload.designs) ? payload.designs :
    Array.isArray(payload.data) ? payload.data :
    [];

  const designs = rawItems
    .filter((item): item is CanvaRecord => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      id: getDesignId(item),
      title: getDesignTitle(item, index),
      thumbnailUrl: getThumbnailUrl(item) || undefined,
      updatedAt: String(item.updated_at || item.created_at || getNestedString(item.design, ["updated_at"]) || "")
    }))
    .filter((item) => item.id);

  return NextResponse.json({ designs });
}
