import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getAuthenticatedUser, loginUser, resendEmailOtp, signupUser, verifyEmailOtp } from './auth.service.js';
import { LoginInput, ResendOtpInput, SignupInput, VerifyOtpInput } from './auth.schemas.js';

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;

  if (!clinicId) {
    throw new AppError('Authentication required', 401);
  }

  const result = await signupUser(req.body as SignupInput, clinicId);

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    data: result
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginUser(req.body as LoginInput);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: result
  });
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
    success: true,
    data: user
  });
});