import { NextRequest, NextResponse } from "next/server";
import { MAX_ARTWORK_BYTES, validateArtworkBuffer } from '@/lib/server/artwork-file-validation';
import { contentLengthExceeds, enforceRateLimit, isSameOriginMutation } from '@/lib/server/request-security';

const CANVA_EXPORTS_URL = "https://api.canva.com/rest/v1/exports";

type JsonRecord = Record<string, unknown>;

const sanitizeFileName = (name: string) =>
  name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "canva-design";

const getNestedValue = (value: unknown, path: string[]) => {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return undefined;
    current = (current as JsonRecord)[key];
  }
  return current;
};

const getExportJob = (payload: JsonRecord) => {
  const job = payload.job;
  return job && typeof job === "object" ? job as JsonRecord : payload;
};

const getJobId = (payload: JsonRecord) => {
  const job = getExportJob(payload);
  return String(job.id || payload.id || "");
};

const getJobStatus = (payload: JsonRecord) => {
  const job = getExportJob(payload);
  return String(job.status || payload.status || "").toLowerCase();
};

const getExportUrl = (payload: JsonRecord) => {
  const directUrls = getNestedValue(payload, ["job", "urls"]);
  if (Array.isArray(directUrls) && typeof directUrls[0] === "string") return directUrls[0];
  const rootUrls = payload.urls;
  if (Array.isArray(rootUrls) && typeof rootUrls[0] === "string") return rootUrls[0];
  const nestedUrl =
    getNestedValue(payload, ["job", "url"]) ||
    getNestedValue(payload, ["asset", "url"]) ||
    getNestedValue(payload, ["job", "asset", "url"]) ||
    payload.url;
  return typeof nestedUrl === "string" ? nestedUrl : "";
};

const finishExport = async (exportPayload: JsonRecord, title: string) => {
  const status = getJobStatus(exportPayload);
  const exportUrl = getExportUrl(exportPayload);
  if (status === "failed" || status === "error") {
    return NextResponse.json({
      error: "Canva could not export this design.",
      details: JSON.stringify(exportPayload).slice(0, 800)
    }, { status: 502 });
  }
  if (status !== "success" || !exportUrl) return null;

  const fileResponse = await fetch(exportUrl, { cache: "no-store" });
  if (!fileResponse.ok) {
    return NextResponse.json({ error: "Canva exported the design, but Hue Studio could not download the file." }, { status: fileResponse.status });
  }
  const declaredLength = Number(fileResponse.headers.get('content-length') || 0);
  if (declaredLength > MAX_ARTWORK_BYTES) return NextResponse.json({ error: 'The Canva export exceeds Hue Studio\'s 50 MB artwork limit.' }, { status: 413 });
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  const validated = validateArtworkBuffer(buffer, { maxBytes: MAX_ARTWORK_BYTES });
  return NextResponse.json({
    name: `${Date.now()}-${sanitizeFileName(title || "canva-design")}.${validated.extension}`,
    mimeType: validated.mimeType,
    dataUrl: `data:${validated.mimeType};base64,${buffer.toString("base64")}`
  });
};

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'This Canva import request came from an untrusted site.' }, { status: 403 });
  const retryAfter = enforceRateLimit(request, 'canva-import', 20, 60 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many Canva exports. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  if (contentLengthExceeds(request, 16 * 1024)) return NextResponse.json({ error: 'The Canva import request is too large.' }, { status: 413 });
  const accessToken = request.cookies.get("hue_canva_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Canva is not connected yet." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { designId?: string; title?: string };
  if (!body.designId) {
    return NextResponse.json({ error: "Choose a Canva design before importing." }, { status: 400 });
  }

  const createResponse = await fetch(CANVA_EXPORTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      design_id: body.designId,
      format: { type: "png" }
    })
  });

  if (!createResponse.ok) {
    const details = await createResponse.text();
    return NextResponse.json({
      error: "Canva could not start the design export.",
      details: details.slice(0, 800)
    }, { status: createResponse.status });
  }

  const exportPayload = await createResponse.json() as JsonRecord;
  const jobId = getJobId(exportPayload);
  if (!jobId) {
    return NextResponse.json({
      error: "Canva started an export but did not return a job id.",
      details: JSON.stringify(exportPayload).slice(0, 800)
    }, { status: 502 });
  }

  const completedResponse = await finishExport(exportPayload, body.title || "canva-design");
  if (completedResponse) return completedResponse;

  return NextResponse.json({ jobId, status: "in_progress" }, { status: 202 });
}

export async function GET(request: NextRequest) {
  const retryAfter = enforceRateLimit(request, 'canva-import-status', 120, 10 * 60 * 1000);
  if (retryAfter) return NextResponse.json({ error: 'Too many Canva status checks. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  const accessToken = request.cookies.get("hue_canva_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Canva is not connected yet." }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId")?.trim();
  const title = request.nextUrl.searchParams.get("title") || "canva-design";
  if (!jobId) {
    return NextResponse.json({ error: "The Canva export job id is missing." }, { status: 400 });
  }

  const pollResponse = await fetch(`${CANVA_EXPORTS_URL}/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!pollResponse.ok) {
    const details = await pollResponse.text();
    return NextResponse.json({
      error: "Hue Studio could not check the Canva export status.",
      details: details.slice(0, 800)
    }, { status: pollResponse.status });
  }

  const exportPayload = await pollResponse.json() as JsonRecord;
  const completedResponse = await finishExport(exportPayload, title);
  if (completedResponse) return completedResponse;

  return NextResponse.json({ jobId, status: "in_progress" }, { status: 202 });
}
