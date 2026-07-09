// Drains the webhook OUTBOX: claim a due delivery, POST it signed, then mark it
// delivered or schedule a retry. Runs across ALL clinics on the raw client and
// re-scopes per row, exactly like the reminder/waitlist crons.
//
// ATOMIC CLAIM. Two app instances (or two overlapping cron ticks) must not send
// the same delivery twice. The claim is a single conditional UPDATE that pushes
// `nextAttemptAt` into the future and bumps `attempts`; only the worker whose
// updateMany reports count===1 owns the row. No SELECT-then-UPDATE race, and no
// extra "SENDING" state to leak if a process dies mid-send (the row simply
// becomes due again after the backoff — hence delivery is AT-LEAST-ONCE, which is
// why every payload carries a stable delivery id the partner can dedupe on).

import axios from 'axios';

import { prisma } from '../../config/prisma.js';
import { secretFor, signPayload } from './webhook.service.js';

const MAX_ATTEMPTS = 6;
const BATCH = 20;
const TIMEOUT_MS = 10_000;

// attempt 1 -> 1m, 2 -> 5m, 3 -> 30m, 4 -> 2h, 5 -> 6h. Index is `attempts` after
// the increment, so the first retry waits a minute.
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];
const backoffFor = (attempts: number): number => BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length) - 1];

/** Claim the row iff it is still due; count===1 means this worker owns it. */
const claimDelivery = async (id: string, attempts: number, now: Date): Promise<boolean> => {
  const { count } = await prisma.webhookDelivery.updateMany({
    where: { id, status: 'PENDING', nextAttemptAt: { lte: now } },
    data: { attempts: attempts + 1, nextAttemptAt: new Date(now.getTime() + backoffFor(attempts + 1)) }
  });
  return count === 1;
};

const deliverOne = async (
  delivery: { id: string; endpointId: string; event: string; payload: unknown; attempts: number },
  endpoint: { url: string; secret: string },
  now: Date
): Promise<void> => {
  // The signature covers the EXACT bytes we send, so serialise once.
  const body = JSON.stringify({ id: delivery.id, ...(delivery.payload as object) });
  const tsSec = Math.floor(now.getTime() / 1000);

  try {
    await axios.post(endpoint.url, body, {
      timeout: TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'X-ClinicBook-Event': delivery.event,
        'X-ClinicBook-Delivery': delivery.id,
        'X-ClinicBook-Signature': signPayload(secretFor(endpoint.secret), body, tsSec)
      },
      // Any 2xx is success; we decide on the status, not on axios throwing.
      validateStatus: (s) => s >= 200 && s < 300
    });
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'DELIVERED', deliveredAt: new Date(), lastError: null }
    });
  } catch (err: unknown) {
    const e = err as { response?: { status?: number }; message?: string };
    const lastError = (e.response?.status ? `HTTP ${e.response.status}` : e.message ?? 'unknown') .slice(0, 500);
    const attempts = delivery.attempts + 1; // claim already incremented it in the DB

    // Out of attempts: park it as FAILED with the reason, rather than retrying
    // a permanently-broken endpoint forever.
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: attempts >= MAX_ATTEMPTS ? { status: 'FAILED', lastError } : { lastError }
    });
  }
};

/** One drain pass. Safe to run concurrently with itself. */
export const processWebhookDeliveries = async (now: Date = new Date()): Promise<void> => {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: now } },
    select: { id: true, endpointId: true, event: true, payload: true, attempts: true },
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH
  });
  if (due.length === 0) return;

  for (const delivery of due) {
    if (!(await claimDelivery(delivery.id, delivery.attempts, now))) continue; // someone else has it

    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: delivery.endpointId },
      select: { url: true, secret: true, enabled: true }
    });
    // Endpoint disabled/deleted after the row was enqueued — stop retrying it.
    if (!endpoint || !endpoint.enabled) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'FAILED', lastError: 'endpoint disabled or removed' }
      });
      continue;
    }

    await deliverOne(delivery, endpoint, now);
  }
};
