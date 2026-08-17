import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { signAccessToken, signMfaChallengeToken } from '../../config/jwt.js';
import { verifyTotp } from './totp.js';
import { AppError } from '../../utils/AppError.js';
import { issueOtp, verifyOtp } from './otp.service.js';
import { LoginInput, SignupInput } from './auth.schemas.js';

// NOTE: raw prisma by design. Authentication runs BEFORE/ACROSS tenancy — login
// and getAuthenticatedUser resolve identity by globally-unique email / userId
// (there is no clinic context yet), and signup checks global email uniqueness.
// The User.create sets clinicId explicitly for the caller's clinic.

const publicUserSelect = {
  id: true,
  clinicId: true,
  name: true,
  email: true,
  role: true,
  // Stamped into the token so it can be revoked. Not a secret and safe to
  // return, but it is not something the dashboard renders — it rides along
  // because every token is minted from this shape.
  tokenVersion: true,
  createdAt: true,
  updatedAt: true
} as const satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const tokenClaims = (user: PublicUser) => ({
  userId: user.id,
  clinicId: user.clinicId,
  email: user.email,
  role: user.role,
  tv: user.tokenVersion
});

const buildAuthResult = (user: PublicUser): AuthResult => ({
  user,
  accessToken: signAccessToken(tokenClaims(user))
});

/**
 * Raised when the password was right but a second factor is still owed.
 *
 * Carries the short-lived challenge token, which proves the password and
 * nothing else — the controller returns it so the client can post a code back.
 */
export class MfaRequiredError extends AppError {
  readonly mfaToken: string;

  constructor(mfaToken: string) {
    // 401, not 200-with-a-flag: a client that does not understand MFA (the
    // native app, which cannot be changed) must treat this as a failed sign-in
    // and show the message, rather than storing an undefined token and crashing.
    super(
      'Two-factor authentication is on for this account. Enter the 6-digit code from your authenticator app.',
      401
    );
    this.mfaToken = mfaToken;
  }
}

export const signupUser = async (input: SignupInput, clinicId: string): Promise<AuthResult> => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId }
  });

  if (!clinic) {
    throw new AppError('Clinic not found', 404);
  }

  const email = normalizeEmail(input.email);
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    throw new AppError('An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      clinicId,
      name: input.name.trim(),
      email,
      passwordHash
    },
    select: publicUserSelect
  });

  return buildAuthResult(user);
};

export const loginUser = async (input: LoginInput): Promise<AuthResult> => {
  const email = normalizeEmail(input.email);
  const userRecord = await prisma.user.findUnique({
    where: { email },
    select: {
      ...publicUserSelect,
      passwordHash: true,
      emailVerified: true,
      mfaEnabled: true
    }
  });

  if (!userRecord) {
    throw new AppError('Invalid email or password', 401);
  }

  const isPasswordValid = await bcrypt.compare(input.password, userRecord.passwordHash);

  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  // Hard gate: an unverified account cannot log in. Re-issue an OTP (cooldown-
  // guarded, swallow the cooldown error) and signal the front-end to show the
  // verification screen via a stable code in the message.
  if (!userRecord.emailVerified) {
    await issueOtp(userRecord.id, userRecord.email).catch(() => undefined);
    throw new AppError('EMAIL_NOT_VERIFIED', 403);
  }

  const { passwordHash: _passwordHash, emailVerified: _emailVerified, mfaEnabled, ...user } = userRecord;

  // Second factor, if this user turned it on. The token issued here proves the
  // PASSWORD only (scope 'mfa'); requireAuth refuses it, and the only route that
  // accepts it is the verification one.
  if (mfaEnabled) {
    throw new MfaRequiredError(signMfaChallengeToken(tokenClaims(user)));
  }

  return buildAuthResult(user);
};

/**
 * Second half of an MFA sign-in: exchange the challenge token plus a valid code
 * for a real session.
 */
export const completeMfaLogin = async (userId: string, code: string): Promise<AuthResult> => {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...publicUserSelect, mfaSecret: true, mfaEnabled: true }
  });

  if (!record?.mfaEnabled || !record.mfaSecret) {
    // MFA was turned off between the two halves of the sign-in. Refuse rather
    // than quietly issuing a token — the client should start again.
    throw new AppError('Two-factor authentication is not set up for this account', 400);
  }

  if (!verifyTotp(record.mfaSecret, code)) {
    throw new AppError('That code is not valid. Check your authenticator app and try again.', 401);
  }

  const { mfaSecret: _secret, mfaEnabled: _enabled, ...user } = record;
  return buildAuthResult(user);
};

// Verify the signup OTP → mark the user verified and issue their access token.
export const verifyEmailOtp = async (emailInput: string, code: string): Promise<AuthResult> => {
  const email = normalizeEmail(emailInput);
  const record = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
  if (!record) {
    throw new AppError('Invalid email or password', 401);
  }
  if (record.emailVerified) {
    // Already verified — just return a fresh token (idempotent for retries).
    const user = await getAuthenticatedUser(record.id);
    return buildAuthResult(user);
  }

  await verifyOtp(record.id, code); // throws on bad/expired/too-many

  const user = await prisma.user.update({
    where: { id: record.id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
    select: publicUserSelect
  });
  return buildAuthResult(user);
};

// Re-send the signup OTP (cooldown enforced in otp.service).
export const resendEmailOtp = async (emailInput: string): Promise<void> => {
  const email = normalizeEmail(emailInput);
  const record = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, emailVerified: true } });
  // Do not reveal whether the email exists; silently succeed when unknown/verified.
  if (!record || record.emailVerified) return;
  await issueOtp(record.id, record.email);
};

export const getAuthenticatedUser = async (userId: string): Promise<PublicUser> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};