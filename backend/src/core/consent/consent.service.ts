// Consent: recording it, withdrawing it, and answering "may we?".
//
// Three decisions shape this file, and each one is a trade-off worth stating
// rather than discovering later from behaviour.
//
// 1. WITHDRAWAL IS ENFORCED; ABSENCE OF CONSENT IS NOT.
//    A patient who has said STOP is never messaged again — that is a hard gate,
//    checked on every send. But a patient who simply has no consent row yet is
//    still messaged, because every patient in the system today has one: they
//    messaged the clinic first, or the clinic booked them. Blocking those sends
//    on the day this ships would silence every appointment reminder for every
//    existing patient — a worse outcome, for them, than the gap it closes. They
//    are shown the notice on their next contact instead, and can opt out from it.
//
//    This is a deliberate grandfathering decision, not an oversight. Turning it
//    into a hard gate is a one-line change to `mayMessage` once every active
//    patient has been shown the notice.
//
// 2. IT FAILS OPEN, LOUDLY.
//    If the consent table cannot be read, sends continue and the error is
//    logged. A database blip must not take out a clinic's reminders. The
//    withdrawal gate is a compliance control, not a safety interlock; the safety
//    interlock is the doctor-approval gate on prescriptions, which fails closed.
//
// 3. CURRENT STATE HERE, HISTORY IN THE AUDIT LOG.
//    This table holds one row per (clinic, patient, purpose) and overwrites it.
//    Who granted or withdrew what, and when, is written to AuditLog, which is
//    append-only and hash-chained. Asking one table to be both cheap to read on
//    every send and impossible to rewrite would have meant losing one of those.

import { prisma } from '../../config/prisma.js';
import { record } from '../audit/audit.service.js';
import { NOTICE_VERSION } from './notice.js';

/** What a patient is being asked about. */
export const CONSENT_PURPOSES = [
  'whatsapp_messaging',
  'consultation_recording',
  'ai_processing',
  // Not a consent: records that the notice was SHOWN, and which version.
  'privacy_notice'
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];
export type ConsentChannel = 'whatsapp' | 'web' | 'app' | 'staff' | 'migration';

/**
 * The last ten digits of a phone number.
 *
 * Deliberately the SAME normalisation the inbound resolver uses (see
 * whatsapp.inbound.ts): a number reaches us as "+91 79038 84686", "917903884686"
 * or "07903884686" and all three are one person. Duplicated rather than imported
 * because that one is private to the inbound module, and because a withdrawal
 * that fails to match is the failure this whole file exists to prevent — the
 * behaviour is pinned by its own test.
 */
export const phoneKey = (phone: string | null | undefined): string => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

interface ConsentInput {
  clinicId: string;
  patientId: string;
  purpose: ConsentPurpose;
  channel: ConsentChannel;
  phone?: string | null;
  evidence?: string;
  noticeVersion?: string;
  /** Who recorded it, when a person did (a doctor ticking the recording box). */
  actorId?: string | null;
  actorRole?: string | null;
}

const upsertConsent = async (input: ConsentInput, status: 'granted' | 'withdrawn' | 'notified') => {
  const now = new Date();
  const data = {
    phoneKey: input.phone ? phoneKey(input.phone) : undefined,
    status,
    noticeVersion: input.noticeVersion ?? NOTICE_VERSION,
    channel: input.channel,
    evidence: input.evidence ?? null,
    grantedAt: status === 'withdrawn' ? undefined : now,
    withdrawnAt: status === 'withdrawn' ? now : null
  };

  return prisma.patientConsent.upsert({
    where: {
      clinicId_patientId_purpose: {
        clinicId: input.clinicId,
        patientId: input.patientId,
        purpose: input.purpose
      }
    },
    create: {
      clinicId: input.clinicId,
      patientId: input.patientId,
      purpose: input.purpose,
      ...data,
      phoneKey: input.phone ? phoneKey(input.phone) : null
    },
    update: data
  });
};

/** Record that a patient agreed to something. Audited. */
export const grantConsent = async (input: ConsentInput): Promise<void> => {
  try {
    await upsertConsent(input, 'granted');
    record({
      clinicId: input.clinicId,
      patientId: input.patientId,
      actorId: input.actorId ?? null,
      actorType: input.actorId ? 'user' : 'patient',
      actorRole: input.actorRole ?? null,
      action: 'CONSENT_GRANTED',
      resourceType: 'consent',
      resourceId: input.purpose,
      metadata: {
        purpose: input.purpose,
        channel: input.channel,
        noticeVersion: input.noticeVersion ?? NOTICE_VERSION,
        evidence: input.evidence ?? ''
      }
    });
  } catch (err) {
    console.error('[consent] could not record consent', input.purpose, err);
  }
};

/**
 * Record that a patient withdrew it.
 *
 * This one is NOT swallowed silently in the same way: the caller needs to know
 * whether the withdrawal actually landed, because it is about to tell the
 * patient "done, you will get no more messages". Saying that when the write
 * failed would be a lie the patient acts on.
 */
export const withdrawConsent = async (input: ConsentInput): Promise<boolean> => {
  try {
    await upsertConsent(input, 'withdrawn');
    record({
      clinicId: input.clinicId,
      patientId: input.patientId,
      actorType: 'patient',
      action: 'CONSENT_WITHDRAWN',
      resourceType: 'consent',
      resourceId: input.purpose,
      metadata: {
        purpose: input.purpose,
        channel: input.channel,
        evidence: input.evidence ?? ''
      }
    });
    return true;
  } catch (err) {
    console.error('[consent] could not record withdrawal', input.purpose, err);
    return false;
  }
};

/** Record that the notice was shown, and which version. Not a consent. */
export const recordNoticeShown = async (input: Omit<ConsentInput, 'purpose'>): Promise<void> => {
  try {
    await upsertConsent({ ...input, purpose: 'privacy_notice' }, 'notified');
  } catch (err) {
    console.error('[consent] could not record that the notice was shown', err);
  }
};

/** Has this patient already been shown the CURRENT notice? */
export const hasSeenCurrentNotice = async (clinicId: string, patientId: string): Promise<boolean> => {
  try {
    const row = await prisma.patientConsent.findUnique({
      where: { clinicId_patientId_purpose: { clinicId, patientId, purpose: 'privacy_notice' } },
      select: { noticeVersion: true }
    });
    return row?.noticeVersion === NOTICE_VERSION;
  } catch (err) {
    // Fail as "already seen" — a database blip must not spam a patient with the
    // notice on every message. Missing one notice is recoverable; sending it
    // twenty times is not.
    console.error('[consent] could not read notice state', err);
    return true;
  }
};

/** Explicit state for a purpose, or null when the patient has never been asked. */
export const consentStatus = async (
  clinicId: string,
  patientId: string,
  purpose: ConsentPurpose
): Promise<'granted' | 'withdrawn' | 'notified' | null> => {
  try {
    const row = await prisma.patientConsent.findUnique({
      where: { clinicId_patientId_purpose: { clinicId, patientId, purpose } },
      select: { status: true }
    });
    return (row?.status as 'granted' | 'withdrawn' | 'notified') ?? null;
  } catch (err) {
    console.error('[consent] could not read consent', purpose, err);
    return null;
  }
};

// ── The enforcement check on the outbound path ──────────────────────────────

/**
 * A withdrawn number is cached briefly so the send path does not query on every
 * message. 60 seconds: long enough to matter on a reminder sweep of hundreds of
 * patients, short enough that a STOP takes effect while the patient is still
 * looking at their phone.
 */
const CACHE_MS = 60_000;
const withdrawnCache = new Map<string, { withdrawn: boolean; at: number }>();

/** Drop a cached answer immediately — called when a patient opts in or out. */
export const forgetCachedOptOut = (clinicId: string, phone: string): void => {
  withdrawnCache.delete(`${clinicId}:${phoneKey(phone)}`);
};

/** Test seam. */
export const clearOptOutCache = (): void => withdrawnCache.clear();

/**
 * May we send this number a WhatsApp message?
 *
 * False ONLY when there is an explicit withdrawal on file. No row means yes —
 * see the grandfathering note at the top of this file.
 */
export const mayMessage = async (clinicId: string | null | undefined, phone: string): Promise<boolean> => {
  if (!clinicId) return true;
  const key = phoneKey(phone);
  if (!key) return true;

  const cacheKey = `${clinicId}:${key}`;
  const cached = withdrawnCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return !cached.withdrawn;

  try {
    const row = await prisma.patientConsent.findFirst({
      where: { clinicId, phoneKey: key, purpose: 'whatsapp_messaging', status: 'withdrawn' },
      select: { id: true }
    });
    const withdrawn = Boolean(row);
    withdrawnCache.set(cacheKey, { withdrawn, at: Date.now() });
    return !withdrawn;
  } catch (err) {
    // Fail OPEN: a clinic's reminders must not stop because this table is
    // briefly unreadable. Loud, so it is not silent for long.
    console.error('[consent] opt-out check failed — allowing the send', err);
    return true;
  }
};
