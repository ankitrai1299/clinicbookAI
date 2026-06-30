// Email OTP for the signup verification gate. The code is 6 digits, hashed at
// rest (SHA-256), single active code per user, 10-minute TTL, max 5 attempts, and
// a 60-second resend cooldown. Pure helpers (generate/hash/validate) are split
// out so they are unit-testable without a DB.

import { createHash, randomInt } from 'crypto';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { sendOtpEmail } from '../../services/email.service.js';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

// ---- PURE helpers (no DB) -------------------------------------------------
export const generateOtp = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

export const hashOtp = (code: string): string => createHash('sha256').update(code, 'utf8').digest('hex');

// Decide whether a presented code is valid given the stored record + now.
// Returns the failure reason (or null = OK) WITHOUT touching the DB, so the rule
// is unit-testable. The caller persists attempts / clears the row.
export const checkOtp = (
  record: { codeHash: string; expiresAt: Date; attempts: number } | null,
  code: string,
  now: number = Date.now()
): 'no-code' | 'expired' | 'too-many' | 'mismatch' | null => {
  if (!record) return 'no-code';
  if (record.attempts >= MAX_ATTEMPTS) return 'too-many';
  if (record.expiresAt.getTime() < now) return 'expired';
  if (record.codeHash !== hashOtp(code)) return 'mismatch';
  return null;
};

// ---- DB-backed operations -------------------------------------------------

// Create (or refresh) the user's OTP and email it. Enforces the resend cooldown.
export const issueOtp = async (userId: string, email: string): Promise<void> => {
  const existing = await prisma.emailOtp.findUnique({ where: { userId } });
  if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new AppError('Please wait a minute before requesting another code.', 429);
  }

  const code = generateOtp();
  const data = {
    codeHash: hashOtp(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
    lastSentAt: new Date()
  };
  await prisma.emailOtp.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data
  });

  // Send AFTER persisting so a delivery hiccup never leaves us without a code on
  // record. NON-FATAL: a send failure must not 500 the signup (the account is
  // already created) — log it loudly; the user can use "Resend". The code is
  // never logged here (it stays secret in prod).
  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error('[otp] verification email failed to send (user can resend):', err instanceof Error ? err.message : err);
  }
};

// Verify a presented code. On success clears the OTP and returns true; on failure
// records the attempt and throws an AppError describing why.
export const verifyOtp = async (userId: string, code: string): Promise<void> => {
  const record = await prisma.emailOtp.findUnique({ where: { userId } });
  const reason = checkOtp(record, code);

  if (reason) {
    if (reason === 'mismatch' && record) {
      await prisma.emailOtp.update({ where: { userId }, data: { attempts: { increment: 1 } } });
    }
    const message =
      reason === 'expired'
        ? 'This code has expired. Request a new one.'
        : reason === 'too-many'
          ? 'Too many incorrect attempts. Request a new code.'
          : 'Incorrect verification code.';
    throw new AppError(message, 401);
  }

  await prisma.emailOtp.delete({ where: { userId } });
};
