import 'server-only';

import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const config = () => ({
  endpoint: (process.env.B2_S3_ENDPOINT || '').replace(/\/$/, ''),
  region: process.env.B2_REGION || '',
  bucket: process.env.B2_BUCKET_NAME || '',
  keyId: process.env.B2_KEY_ID || '',
  applicationKey: process.env.B2_APPLICATION_KEY || '',
});

let cachedClient: S3Client | null = null;

export const hasBackblazeB2Config = () => Object.values(config()).every(Boolean);

export const getBackblazeB2Bucket = () => {
  const { bucket } = config();
  if (!bucket) throw new Error('Backblaze B2 bucket is not configured.');
  return bucket;
};

const client = () => {
  if (cachedClient) return cachedClient;
  const { endpoint, region, keyId, applicationKey } = config();
  if (!endpoint || !region || !keyId || !applicationKey) {
    throw new Error('Backblaze B2 credentials are incomplete.');
  }
  cachedClient = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    // AWS SDK v3 enables CRC32 checksums for S3 uploads by default. A presigned
    // browser upload has no body at signing time, so that produces an empty-body
    // checksum in the URL that does not match the file later sent to Backblaze.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: keyId, secretAccessKey: applicationKey },
  });
  return cachedClient;
};

export const createBackblazeUploadUrl = async (args: {
  objectKey: string;
  contentType: string;
  expiresIn?: number;
}) => getSignedUrl(client(), new PutObjectCommand({
  Bucket: getBackblazeB2Bucket(),
  Key: args.objectKey,
  ContentType: args.contentType,
}), { expiresIn: args.expiresIn || 15 * 60 });

export const getBackblazeObjectMetadata = async (objectKey: string) => {
  const result = await client().send(new HeadObjectCommand({
    Bucket: getBackblazeB2Bucket(),
    Key: objectKey,
  }));
  return {
    size: Number(result.ContentLength || 0),
    contentType: result.ContentType || 'application/octet-stream',
    etag: result.ETag?.replace(/^"|"$/g, '') || null,
    metadata: result.Metadata || {},
    lastModified: result.LastModified?.toISOString() || null,
  };
};

const bodyToBuffer = async (body: unknown) => {
  const stream = body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!stream?.transformToByteArray) throw new Error('Backblaze B2 did not return file bytes.');
  return Buffer.from(await stream.transformToByteArray());
};

export const readBackblazeObjectRange = async (objectKey: string, range: string) => {
  const result = await client().send(new GetObjectCommand({
    Bucket: getBackblazeB2Bucket(),
    Key: objectKey,
    Range: range,
  }));
  return bodyToBuffer(result.Body);
};

export const downloadBackblazeObjectToFile = async (objectKey: string, filePath: string) => {
  const result = await client().send(new GetObjectCommand({
    Bucket: getBackblazeB2Bucket(),
    Key: objectKey,
  }));
  const body = result.Body as NodeJS.ReadableStream | undefined;
  if (!body || typeof body.pipe !== 'function') throw new Error('Backblaze B2 did not return a readable production file.');
  await pipeline(body, createWriteStream(filePath));
};

export const createBackblazeDownloadUrl = async (objectKey: string, expiresIn = 15 * 60) => getSignedUrl(
  client(),
  new GetObjectCommand({ Bucket: getBackblazeB2Bucket(), Key: objectKey }),
  { expiresIn },
);

export const deleteBackblazeObject = async (objectKey: string) => {
  await client().send(new DeleteObjectCommand({
    Bucket: getBackblazeB2Bucket(),
    Key: objectKey,
  }));
};
