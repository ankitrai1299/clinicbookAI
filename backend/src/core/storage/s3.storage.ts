import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

import type { StoragePort, StoredObject } from './storage.port.js';

// Any S3-compatible bucket: AWS S3, Cloudflare R2, Supabase Storage, Backblaze
// B2, MinIO. One adapter covers all of them because they speak the same API, so
// choosing a provider is a matter of four environment variables and not a code
// change.
//
// The bucket must be PRIVATE. Nothing here ever makes an object public: reads go
// through the app, which checks the caller's clinic against the key first. A
// public bucket would hand out patient consultation audio to anyone with a URL.

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string; // R2/Supabase/MinIO need this; plain AWS does not
  accessKeyId: string;
  secretAccessKey: string;
}

export const s3ConfigFromEnv = (): S3Config | null => {
  const bucket = (process.env.STORAGE_S3_BUCKET || '').trim();
  const accessKeyId = (process.env.STORAGE_S3_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.STORAGE_S3_SECRET_ACCESS_KEY || '').trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    // R2 ignores the region but the SDK insists on one.
    region: (process.env.STORAGE_S3_REGION || 'auto').trim(),
    endpoint: (process.env.STORAGE_S3_ENDPOINT || '').trim() || undefined,
    accessKeyId,
    secretAccessKey
  };
};

const toBuffer = async (body: unknown): Promise<Buffer> => {
  const stream = body as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

export const createS3Storage = (cfg: S3Config): StoragePort => {
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    // Required by R2/MinIO, harmless on AWS: keeps the bucket in the path
    // instead of the hostname.
    forcePathStyle: Boolean(cfg.endpoint),
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
  });

  return {
    name: `s3(${cfg.endpoint ? `${cfg.endpoint}/` : ''}${cfg.bucket})`,
    durable: true,

    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType })
      );
    },

    async get(key): Promise<StoredObject | null> {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
        if (!out.Body) return null;
        return {
          body: await toBuffer(out.Body),
          contentType: out.ContentType || 'application/octet-stream'
        };
      } catch (err) {
        const name = (err as { name?: string }).name;
        // A missing object is an ordinary answer, not a failure.
        if (name === 'NoSuchKey' || name === 'NotFound') return null;
        throw err;
      }
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    }
  };
};
