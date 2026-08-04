// Shared-platform-number multi-tenancy: which clinic does a patient on the ONE
// shared WhatsApp number belong to? Answered by a join code (from the clinic's
// QR/link) on the FIRST message, remembered thereafter. All data stays scoped by
// the resolved clinicId — clinics never mix.

import { prisma } from '../../config/prisma.js';

const digitsOf = (s: string | null | undefined): string => (s || '').replace(/\D/g, '');

// The shared host clinic — the one patient recovery must never guess, because its
// doctors are not any real clinic's doctors. It is identified by its well-known
// email, NOT by WHATSAPP_CLINIC_ID: that env var only says which clinic OWNS the
// env WhatsApp number, and in most deployments that is a REAL clinic with real
// patients. Conflating the two made recovery skip the very clinic the patient
// belonged to.
const PLATFORM_CLINIC_EMAIL = 'platform@clinicbook.ai';
let platformClinicIdCache: string | null | undefined;
const platformClinicId = async (): Promise<string | null> => {
  if (platformClinicIdCache !== undefined) return platformClinicIdCache;
  const row = await prisma.clinic.findUnique({
    where: { email: PLATFORM_CLINIC_EMAIL },
    select: { id: true }
  });
  platformClinicIdCache = row?.id ?? null;
  return platformClinicIdCache;
};

// Canonical phone key. WhatsApp delivers numbers with a country code (91…) while
// some records were stored national (10 digits). Key everything by the LAST 10
// digits so "917903884686" and "7903884686" are the SAME patient — otherwise a
// binding made in one format never matches the other and clinics silently mix.
export const phoneKey = (s: string | null | undefined): string => {
  const d = digitsOf(s);
  return d.length > 10 ? d.slice(-10) : d;
};

/**
 * Pull a clinic join code out of a patient's message. Accepts "join ABC123",
 * "clinic ABC123", "code ABC123", or a message that is JUST the code. Returns the
 * uppercased code, or null when the message carries none.
 */
export const extractJoinCode = (text: string | null | undefined): string | null => {
  const t = (text || '').trim();
  const tagged = t.match(/\b(?:join|clinic|code|start)\s+([A-Za-z0-9]{4,12})\b/i);
  if (tagged) return tagged[1].toUpperCase();
  if (/^[A-Za-z0-9]{4,12}$/.test(t)) return t.toUpperCase();
  return null;
};

/** The clinic that owns a join code (or null). */
export const clinicByJoinCode = async (
  code: string | null
): Promise<{ id: string; name: string } | null> => {
  if (!code) return null;
  return prisma.clinic.findFirst({
    where: { joinCode: code.toUpperCase() },
    select: { id: true, name: true }
  });
};

/** The clinic a phone is already bound to (or null). */
export const getBoundClinic = async (phone: string): Promise<string | null> => {
  const d = phoneKey(phone);
  if (!d) return null;
  const b = await prisma.whatsAppPatientBinding.findUnique({
    where: { phone: d },
    select: { clinicId: true }
  });
  return b?.clinicId ?? null;
};

// Unambiguous alphabet (no 0/O/1/I/L) for a code patients read off a QR/poster.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomCode = (len = 6): string =>
  Array.from({ length: len }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

/** Return the clinic's join code, generating a unique one on first use. */
export const ensureClinicJoinCode = async (clinicId: string): Promise<string> => {
  const existing = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { joinCode: true } });
  if (existing?.joinCode) return existing.joinCode;
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = randomCode();
    try {
      await prisma.clinic.update({ where: { id: clinicId }, data: { joinCode: code } });
      return code;
    } catch {
      /* unique collision — try another */
    }
  }
  throw new Error('[whatsapp.binding] could not generate a unique join code');
};

/** Bind (or re-bind) a phone to a clinic. Idempotent. */
export const bindPatient = async (phone: string, clinicId: string): Promise<void> => {
  const d = phoneKey(phone);
  if (!d) return;
  await prisma.whatsAppPatientBinding.upsert({
    where: { phone: d },
    create: { phone: d, clinicId },
    update: { clinicId }
  });
};

/**
 * SELF-HEAL: a phone that isn't bound yet but is ALREADY a patient of exactly one
 * real (non-platform) clinic → re-bind them to that clinic. This recovers patients
 * whose binding was lost/never written (or was stored in a different phone format)
 * without dumping them onto the shared platform clinic and leaking ITS doctors.
 * Returns the recovered clinicId, or null when the patient is unknown or ambiguous.
 */
const recoverClinicByExistingPatient = async (phone: string): Promise<string | null> => {
  const last10 = phoneKey(phone);
  if (last10.length < 10) return null;
  const platformId = await platformClinicId();
  const rows = await prisma.patient.findMany({
    where: {
      phone: { endsWith: last10 },
      ...(platformId ? { clinicId: { not: platformId } } : {})
    },
    select: { clinicId: true },
    distinct: ['clinicId']
  });
  if (rows.length === 1) {
    await bindPatient(phone, rows[0].clinicId);
    return rows[0].clinicId;
  }
  return null;
};

/**
 * Resolve the clinic for a shared-number inbound (called only when the receiving
 * number is NOT a clinic's own connected number). Order: an explicit join code in
 * the message (→ bind), else the phone's existing binding. Returns the clinicId
 * and whether we JUST bound it (so the caller can send a welcome), or null when
 * the patient is new and sent no code (→ ask them for one).
 */
export const resolveSharedClinic = async (
  phone: string,
  text: string
): Promise<{ clinicId: string | null; justBoundName?: string }> => {
  const code = extractJoinCode(text);
  if (code) {
    const clinic = await clinicByJoinCode(code);
    if (clinic) {
      await bindPatient(phone, clinic.id);
      return { clinicId: clinic.id, justBoundName: clinic.name };
    }
  }
  const bound = await getBoundClinic(phone);
  if (bound) return { clinicId: bound };

  // Not bound and no code — before giving up (and asking for a code), see if this
  // phone is already a known patient of exactly one clinic and re-bind them.
  const recovered = await recoverClinicByExistingPatient(phone);
  if (recovered) return { clinicId: recovered };

  return { clinicId: null };
};
