import 'server-only';

export type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  trashed?: boolean;
  parents?: string[];
};

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const config = () => ({
  clientId: process.env.GOOGLE_DRIVE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || '',
  refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '',
  rootFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
});

export const isGoogleDriveArchiveConfigured = () => Object.values(config()).every(Boolean);
export const getGoogleDriveRootFolderId = () => config().rootFolderId;

const getAccessToken = async () => {
  const { clientId, clientSecret, refreshToken } = config();
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Google Drive archive credentials are incomplete.');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Google token request failed (${response.status}).`);
  }
  return payload.access_token;
};

const driveFetch = async (url: string, init: RequestInit = {}) => {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Drive request failed (${response.status}): ${details.slice(0, 500)}`);
  }
  return response;
};

const escapeQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const findChild = async (parentId: string, name: string, mimeType?: string): Promise<DriveFile | null> => {
  const clauses = [`'${escapeQuery(parentId)}' in parents`, `name = '${escapeQuery(name)}'`, 'trashed = false'];
  if (mimeType) clauses.push(`mimeType = '${escapeQuery(mimeType)}'`);
  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'files(id,name,webViewLink)',
    spaces: 'drive',
    pageSize: '10',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  const response = await driveFetch(`${DRIVE_API}/files?${params}`);
  const payload = await response.json() as { files?: DriveFile[] };
  return payload.files?.[0] || null;
};

export const sanitizeDriveName = (value: string, fallback = 'UNTITLED') => {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim();
  return (cleaned || fallback).slice(0, 180);
};

export const ensureDriveFolder = async (parentId: string, rawName: string): Promise<DriveFile> => {
  const name = sanitizeDriveName(rawName, 'FOLDER');
  const mimeType = 'application/vnd.google-apps.folder';
  const existing = await findChild(parentId, name, mimeType);
  if (existing) return existing;
  const response = await driveFetch(`${DRIVE_API}/files?supportsAllDrives=true&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType, parents: [parentId] }),
  });
  return response.json() as Promise<DriveFile>;
};

export const uploadDriveFileIfMissing = async (args: {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: ArrayBuffer | Uint8Array;
}) => {
  const name = sanitizeDriveName(args.name, 'artwork-file');
  const existing = await findChild(args.parentId, name);
  if (existing) return existing;
  const bytes = args.bytes instanceof Uint8Array ? args.bytes : new Uint8Array(args.bytes);
  const start = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': args.mimeType,
      'X-Upload-Content-Length': String(bytes.byteLength),
    },
    body: JSON.stringify({ name, mimeType: args.mimeType, parents: [args.parentId] }),
  });
  const uploadUrl = start.headers.get('location');
  if (!uploadUrl) throw new Error('Google Drive did not return a resumable upload URL.');
  const finish = await driveFetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': args.mimeType, 'Content-Length': String(bytes.byteLength) },
    body: bytes as BodyInit,
  });
  return finish.json() as Promise<DriveFile>;
};

export const uploadDriveFileFromUrlIfMissing = async (args: {
  parentId: string;
  name: string;
  mimeType: string;
  sourceUrl: string;
  size: number;
}) => {
  const name = sanitizeDriveName(args.name, 'artwork-file');
  const existing = await findChild(args.parentId, name);
  if (existing) return existing;
  if (!Number.isFinite(args.size) || args.size < 1) throw new Error('The source file size is required for a Drive transfer.');

  const source = await fetch(args.sourceUrl, { cache: 'no-store' });
  if (!source.ok || !source.body) throw new Error(`Could not open the production source for Drive (${source.status}).`);
  const start = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,webViewLink`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': args.mimeType,
      'X-Upload-Content-Length': String(args.size),
    },
    body: JSON.stringify({ name, mimeType: args.mimeType, parents: [args.parentId] }),
  });
  const uploadUrl = start.headers.get('location');
  if (!uploadUrl) throw new Error('Google Drive did not return a resumable upload URL.');
  const uploadRequest = {
    method: 'PUT',
    headers: { 'Content-Type': args.mimeType, 'Content-Length': String(args.size) },
    body: source.body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' };
  const finish = await driveFetch(uploadUrl, uploadRequest);
  return finish.json() as Promise<DriveFile>;
};

export const uploadDriveFileFromStreamIfMissing = async (args: {
  parentId: string;
  name: string;
  mimeType: string;
  body: ReadableStream<Uint8Array>;
  size: number;
}) => {
  const name = sanitizeDriveName(args.name, 'artwork-file');
  const existing = await findChild(args.parentId, name);
  if (existing) {
    await args.body.cancel('The Drive production file already exists.').catch(() => undefined);
    return existing;
  }
  if (!Number.isFinite(args.size) || args.size < 1) throw new Error('The streamed file size is required for a Drive transfer.');
  const start = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,webViewLink`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': args.mimeType,
      'X-Upload-Content-Length': String(args.size),
    },
    body: JSON.stringify({ name, mimeType: args.mimeType, parents: [args.parentId] }),
  });
  const uploadUrl = start.headers.get('location');
  if (!uploadUrl) throw new Error('Google Drive did not return a resumable upload URL.');
  const uploadRequest = {
    method: 'PUT',
    headers: { 'Content-Type': args.mimeType, 'Content-Length': String(args.size) },
    body: args.body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' };
  const finish = await driveFetch(uploadUrl, uploadRequest);
  return finish.json() as Promise<DriveFile>;
};

export const copyDriveFileIfMissing = async (args: {
  sourceFileId: string;
  parentId: string;
  name: string;
}) => {
  const name = sanitizeDriveName(args.name, 'artwork-file');
  const existing = await findChild(args.parentId, name);
  if (existing) return existing;
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(args.sourceFileId)}/copy?supportsAllDrives=true&fields=id,name,size,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: [args.parentId] }),
  });
  return response.json() as Promise<DriveFile>;
};

export const openDriveFileStream = async (fileId: string) => {
  if (!fileId) throw new Error('A Google Drive file id is required.');
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
  if (!response.body) throw new Error('Google Drive did not return a file stream.');
  return response.body;
};

export const readDriveFileRange = async (fileId: string, start: number, end: number) => {
  if (!fileId) throw new Error('A Google Drive file id is required.');
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Range: `bytes=${Math.max(0, Math.round(start))}-${Math.max(0, Math.round(end))}` },
  });
  return new Uint8Array(await response.arrayBuffer());
};

export const getDriveFileMetadata = async (fileId: string): Promise<DriveFile> => {
  if (!fileId) throw new Error('A Google Drive file id is required.');
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,size,webViewLink,trashed,parents',
    supportsAllDrives: 'true',
  });
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?${params}`);
  return response.json() as Promise<DriveFile>;
};

export const trashDriveFile = async (fileId: string) => {
  if (!fileId) throw new Error('A Google Drive file id is required.');
  await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
};

export const downloadDriveFile = async (fileId: string) => {
  if (!fileId) throw new Error('A Google Drive file id is required.');
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
  return {
    bytes: await response.arrayBuffer(),
    mimeType: response.headers.get('content-type') || 'application/octet-stream',
  };
};

export const driveFolderUrl = (folderId: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
