import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getAuthenticatedUser, loginUser, signupUser } from './auth.service.js';
import { LoginInput, SignupInput } from './auth.schemas.js';

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const result = await signupUser(req.body as SignupInput);

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