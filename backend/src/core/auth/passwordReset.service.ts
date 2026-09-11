// Getting back into an account you are locked out of.
//
// ── Why this did not exist, and why that mattered ──────────────────────────
//
// There was no way back in. A clinic admin who forgot their password needed
// somebody with database access to write a new hash by hand — which happened to
// this platform's own owner during development, and would have happened to a
// paying clinic on a Sunday.
//
// It is also a finding an auditor writes down: account recovery is part of
// authentication, and "we do it manually in the database" is the wrong answer
// to give one.
//
// ── Reusing the OTP machinery rather than inventing a token ────────────────
//
// Email verification at signup already issues a six-digit code with hashing, a
// resend cooldown and an attempt limit. A password reset asks the same question
// of the same mailbox — *can you read mail sent to this address* — so it uses
// the same mechanism instead of a second, less-tested one built beside it.
//
// The consequence, stated plainly: one code per user at a time. A reset request
// replaces a pending signup code. Both prove the same fact, so neither grants
// anything the other would not have.
//
// ── The two rules that make this safe ──────────────────────────────────────
//
// It NEVER says whether an email exists. `requestReset` returns the same thing
// for a registered address and an unregistered one, so this endpoint cannot be
// used to enumerate the platform's customers.
//
// Every existing session dies on reset. If a password is being reset because
// somebody else had it, leaving their token alive would defeat the point.

import bcrypt from 'bcryptjs';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { isEmailConfigured } from '../../services/email.service.js';
import { issueOtp, verifyOtp } from './otp.service.js';
import { revokeAllSessions } from './session.service.js';

/** Same cost as signup. Changing it here and not there is how hashes diverge. */
const BCRYPT_COST = 12;

/** Matches the signup schema, so a reset cannot set a password signup would reject. */
const MIN_PASSWORD = 8;

/**
 * Send a reset code, if that address belongs to anybody.
 *
 * Returns nothing in every case. The caller answers identically whether or not
 * the account exists — an endpoint that says "no such user" is a list of who
 * IS a user, one guess at a time.
 */
export const requestPasswordReset = async (email: string): Promise<void> => {
  const normalised = email.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalised, mode: 'insensitive' } },
    select: { id: true, email: true }
  });

  // No user, or no mail configured: say nothing, do nothing, look identical.
  if (!user || !isEmailConfigured()) return;

  try {
    await issueOtp(user.id, user.email);
  } catch (err) {
    // A cooldown or a send failure must not become a different answer to the
    // caller — that would leak the account's existence just as plainly as an
    // error message naming it.
    console.error('[auth] could not issue a password reset code:', err);
  }
};

/**
 * Set a new password, given the code from that mailbox.
 *
 * Unlike the request above, this DOES fail loudly. By now the caller has quoted
 * a code, and telling them it is wrong reveals nothing they could not have
 * learned by trying — while saying nothing would make a mistyped digit
 * indistinguishable from success.
 */
export const resetPassword = async (email: string, code: string, newPassword: string): Promise<void> => {
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD) {
    throw new AppError(`A password needs at least ${MIN_PASSWORD} characters.`, 400);
  }

  const normalised = String(email ?? '').trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalised, mode: 'insensitive' } },
    select: { id: true }
  });

  // The same wording a wrong code gets, so a guessed email and a wrong code are
  // one answer rather than two.
  if (!user) throw new AppError('Incorrect verification code.', 401);

  // Throws on expiry, too many attempts or a mismatch, and DELETES the row on
  // success — so a code cannot be spent twice.
  await verifyOtp(user.id, String(code ?? ''));

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST) }
  });

  // Everything issued against the old password stops working now. If the reset
  // is happening because somebody else had that password, this is the step that
  // actually removes them.
  //
  // It returns the new token version, NOT a count of sessions — nothing here
  // knows how many were live, and reporting the version as a number of sessions
  // would be a plausible-looking lie on a security screen.
  await revokeAllSessions(user.id);

  console.info(`[auth] password reset for user ${user.id}; all sessions revoked`);
};
