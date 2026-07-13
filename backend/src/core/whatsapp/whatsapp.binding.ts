// Shared-platform-number multi-tenancy: which clinic does a patient on the ONE
// shared WhatsApp number belong to? Answered by a join code (from the clinic's
// QR/link) on the FIRST message, remembered thereafter. All data stays scoped by
// the resolved clinicId — clinics never mix.

import { prisma } from '../../config/prisma.js';

const digitsOf = (s: string | null | undefined): string => (s || '').replace(/\D/g, '');

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
  const d = digitsOf(phone);
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
  const d = digitsOf(phone);
  if (!d) return;
  await prisma.whatsAppPatientBinding.upsert({
    where: { phone: d },
    create: { phone: d, clinicId },
    update: { clinicId }
  });
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
  return { clinicId: null };
};
