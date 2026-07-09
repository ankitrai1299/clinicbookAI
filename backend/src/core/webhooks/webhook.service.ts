// Outbound webhooks — registration, signing, and the OUTBOX write.
//
// A partner registers a URL + the events it cares about; every matching domain
// event writes a WebhookDelivery row (see webhook.subscriptions) which the cron
// drains. We never POST from inside an event handler: the bus is fire-and-forget,
// so an HTTP failure there would silently lose the notification.
//
// Signing is Stripe-style so a partner can prove the request is ours AND that it
// is fresh (the timestamp is inside the signed payload, defeating replay):
//   X-ClinicBook-Signature: t=<unix>,v1=<hex hmac_sha256(secret, `${t}.${body}`)>

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { decryptSecret, deriveKey, encryptSecret } from '../whatsapp/whatsapp.crypto.js';
import type { DomainEventName } from '../events/events.types.js';

// The crypto module is pure (key passed in) despite living under core/whatsapp.
const encKey = (): Buffer | null => (env.WEBHOOK_ENC_KEY ? deriveKey(env.WEBHOOK_ENC_KEY) : null);

const SECRET_PREFIX = 'whsec_';

// Only events a partner has any business receiving. Adding one here is the whole
// change needed to expose it.
export const DELIVERABLE_EVENTS: readonly DomainEventName[] = [
  'appointment.booked',
  'appointment.cancelled',
  'appointment.rescheduled',
  'appointment.completed'
] as const;

export interface RegisteredWebhook {
  id: string;
  url: string;
  events: string[];
  /** Signing secret — shown ONCE, so the partner can verify our signatures. */
  secret: string;
}

export const registerWebhook = async (
  clinicId: string,
  url: string,
  events: string[]
): Promise<RegisteredWebhook> => {
  const unknown = events.filter((e) => !DELIVERABLE_EVENTS.includes(e as DomainEventName));
  if (events.length === 0 || unknown.length > 0) {
    throw new AppError(
      `Subscribe to at least one of: ${DELIVERABLE_EVENTS.join(', ')}` +
        (unknown.length ? ` (unknown: ${unknown.join(', ')})` : ''),
      400
    );
  }

  const secret = SECRET_PREFIX + randomBytes(24).toString('base64url');
  const row = await prisma.webhookEndpoint.create({
    data: { clinicId, url, events, secret: encryptSecret(secret, encKey()) },
    select: { id: true, url: true, events: true }
  });
  return { ...row, secret };
};

export const listWebhooks = (clinicId: string) =>
  prisma.webhookEndpoint.findMany({
    where: { clinicId },
    select: { id: true, url: true, events: true, enabled: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });

export const disableWebhook = async (clinicId: string, id: string): Promise<void> => {
  const { count } = await prisma.webhookEndpoint.updateMany({
    where: { id, clinicId, enabled: true },
    data: { enabled: false }
  });
  if (count === 0) throw new AppError('Webhook endpoint not found', 404);
};

/** Plaintext signing secret for an endpoint (decrypted at send time). */
export const secretFor = (storedSecret: string): string => decryptSecret(storedSecret, encKey());

/**
 * `t=<unix>,v1=<hex>` over `${t}.${body}`. The timestamp is INSIDE the signed
 * material, so a captured request cannot be replayed with a fresh timestamp.
 */
export const signPayload = (secret: string, body: string, timestampSec: number): string => {
  const v1 = createHmac('sha256', secret).update(`${timestampSec}.${body}`).digest('hex');
  return `t=${timestampSec},v1=${v1}`;
};

/**
 * Verify a signature the way a partner should. Exported so our own tests (and
 * the docs) exercise exactly the algorithm partners implement. Rejects anything
 * older than `toleranceSec` to bound the replay window.
 */
export const verifySignature = (
  secret: string,
  body: string,
  header: string,
  nowSec: number,
  toleranceSec = 300
): boolean => {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > toleranceSec) return false;
  if (typeof parts.v1 !== 'string' || parts.v1.length === 0) return false;

  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(parts.v1, 'hex');
  } catch {
    return false;
  }
  // Length check first: timingSafeEqual throws on a length mismatch.
  return provided.length === expected.length && timingSafeEqual(provided, expected);
};
