import { createHmac, timingSafeEqual } from 'crypto';

import { env } from '../../config/env.js';
import type { StoragePort } from './storage.port.js';
import { localDiskStorage } from './localDisk.storage.js';
import { createS3Storage, s3ConfigFromEnv } from './s3.storage.js';

export type { StoragePort, StoredObject } from './storage.port.js';
export { objectKey, clinicOfKey } from './storage.port.js';

// Pick the backend once, at first use. Configured S3 wins; otherwise local disk,
// which is fine for development and honest about not surviving a deploy.
let resolved: StoragePort | null = null;

export const storage = (): StoragePort => {
  if (resolved) return resolved;
  const cfg = s3ConfigFromEnv();
  resolved = cfg ? createS3Storage(cfg) : localDiskStorage;
  console.info(
    `[storage] using ${resolved.name}${resolved.durable ? '' : ' — NOT durable, uploads are lost on restart'}`
  );
  return resolved;
};

/** Test seam — no production caller. */
export const setStorage = (impl: StoragePort | null): void => {
  resolved = impl;
};

// ── Signed read URLs ────────────────────────────────────────────────────────
//
// An <audio> element cannot send an Authorization header, which is why this
// audio used to be served from an unauthenticated static mount and defended
// only by a filename containing a millisecond timestamp. Consultation audio is
// a recording of a patient's visit; "hard to guess" is not access control.
//
// So the URL carries its own proof: an expiry and an HMAC over the key. The
// player needs no header, the link stops working, and a leaked URL leaks one
// recording for minutes rather than everything forever.

const TTL_SECONDS = 60 * 60; // long enough to open and replay a consultation

const sign = (key: string, expires: number): string =>
  createHmac('sha256', env.JWT_SECRET).update(`${key}\n${expires}`).digest('hex');

export const signedPath = (key: string, now: Date = new Date()): string => {
  const expires = Math.floor(now.getTime() / 1000) + TTL_SECONDS;
  return `/api/mediscribe/audio/${encodeURI(key)}?e=${expires}&s=${sign(key, expires)}`;
};

export type SignatureCheck = 'ok' | 'expired' | 'bad';

export const verifySignature = (
  key: string,
  expires: string | undefined,
  signature: string | undefined,
  now: Date = new Date()
): SignatureCheck => {
  const exp = Number(expires);
  if (!Number.isFinite(exp) || !signature) return 'bad';

  // Compare BEFORE checking expiry, and always with a constant-time compare, so
  // neither the answer nor the time taken reveals anything about a valid one.
  const expected = Buffer.from(sign(key, exp), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'bad';

  return exp * 1000 < now.getTime() ? 'expired' : 'ok';
};
