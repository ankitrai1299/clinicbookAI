import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getDashboardStats } from './analytics.service.js';

export const getDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;

  if (!clinicId) {
    throw new AppError('Authentication required', 401);
  }

  const data = await getDashboardStats(clinicId);

  res.status(200).json({
    success: true,
    data
  });
});
