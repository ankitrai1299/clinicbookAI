import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { record, recordFromRequest } from '../audit/audit.service.js';
import { toNativeAppUser, withNativeAppAuth } from './nativeAppCompat.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getAuthenticatedUser, loginUser, resendEmailOtp, signupUser, verifyEmailOtp } from './auth.service.js';
import { LoginInput, ResendOtpInput, SignupInput, VerifyOtpInput } from './auth.schemas.js';

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;

  if (!clinicId) {
    throw new AppError('Authentication required', 401);
  }

  const result = await signupUser(req.body as SignupInput, clinicId);

  recordFromRequest(req, {
    action: 'USER_CREATED',
    resourceType: 'user',
    resourceId: result.user.id,
    metadata: { role: result.user.role, email: result.user.email }
  });

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    data: result
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  let result: Awaited<ReturnType<typeof loginUser>>;
  try {
    result = await loginUser(req.body as LoginInput);
  } catch (err) {
    // A failed sign-in is the single most useful row in the trail — repeated
    // failures against one email are what a brute-force attempt looks like from
    // the inside. There is no clinic yet (the credentials did not resolve to a
    // user), so this row has a null clinicId and is read server-side.
    //
    // The EMAIL is stored because without it the row cannot be correlated at
    // all; the password never is, and `reason` is our own stable code, never the
    // library's message.
    record({
      action: 'FAILED_LOGIN',
      actorType: 'anonymous',
      outcome: 'failure',
      reason: err instanceof AppError ? err.message : 'error',
      ip: req.ip ?? null,
      userAgent: (req.headers['user-agent'] || '').toString().slice(0, 300) || null,
      requestId: req.requestId ?? null,
      metadata: { email: String((req.body as LoginInput)?.email ?? '') }
    });
    throw err;
  }

  record({
    action: 'LOGIN',
    clinicId: result.user.clinicId,
    actorId: result.user.id,
    actorType: 'user',
    actorRole: result.user.role,
    actorName: result.user.name,
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] || '').toString().slice(0, 300) || null,
    requestId: req.requestId ?? null
  });

  // The native MediScribe app reads { token, user } from the top level; the web
  // reads `data`. Both are sent — see nativeAppCompat.
  res.status(200).json(
    withNativeAppAuth(
      {
        success: true,
        message: 'Login successful',
        data: result
      },
      result
    )
  );
});

// Verify the signup OTP → returns { user, accessToken } (the verified login).
export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, code } = req.body as VerifyOtpInput;
  const result = await verifyEmailOtp(email, code);
  res.status(200).json({ success: true, message: 'Email verified', data: result });
});

// Re-send the signup OTP. Always 200 (never reveals whether the email exists).
export const resendOtp = asyncHandler(async (req: Request, res: Response) => {
  await resendEmailOtp((req.body as ResendOtpInput).email);
  res.status(200).json({ success: true, message: 'If that account needs verification, a new code has been sent.' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const user = await getAuthenticatedUser(userId);

  res.status(200).json({
    // The app takes `data?.user ?? data`, so a top-level `user` in the app's own
    // shape is what it ends up reading.
    user: toNativeAppUser(user),
    success: true,
    data: user
  });
});