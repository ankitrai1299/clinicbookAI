// Inbound WhatsApp idempotency, shared across backend instances.
//
// Meta retries a webhook delivery until it gets a 200, so the SAME message id
// legitimately arrives more than once — and with more than one instance running,
// the retry can land on a different one than the original. An in-process Set
// cannot see that, so every retry would be processed again: a second booking
// step, a second reply, potentially a second appointment.
//
// The guard is the PRIMARY KEY. Processing is CLAIMED with an insert; a
// duplicate insert violates it and the message is dropped. That is atomic in the
// database, so two instances racing on the same id cannot both win.
//
// Deliberately FAIL-OPEN: if the claim can't be written (DB blip), the message
// is processed. A duplicate reply is a nuisance; a silently dropped booking is
// the patient never hearing back.

import { Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';

// Meta's retry window is minutes. Keeping a day is generous and keeps the table
// small enough that the sweep is trivial.
export const DEDUPE_RETENTION_HOURS = 24;

/**
 * Claim a message id for processing.
 * @returns true when THIS caller may process it; false when it was already claimed.
 */
export const claimInboundMessage = async (waMessageId: string): Promise<boolean> => {
  try {
    await prisma.processedInboundMessage.create({ data: { waMessageId } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false; // someone (or some instance) already has it
    }
    console.error('[WhatsApp][dedupe] claim failed — processing anyway:', err);
    return true; // fail open, see header
  }
};

/** Drop claims older than the retention window. Safe to call from any instance. */
export const sweepProcessedMessages = async (
  now: Date = new Date()
): Promise<number> => {
  const cutoff = new Date(now.getTime() - DEDUPE_RETENTION_HOURS * 3600_000);
  try {
    const { count } = await prisma.processedInboundMessage.deleteMany({
      where: { processedAt: { lt: cutoff } }
    });
    return count;
  } catch (err) {
    console.error('[WhatsApp][dedupe] sweep failed:', err);
    return 0;
  }
};
