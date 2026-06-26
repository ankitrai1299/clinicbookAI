import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getDashboardStats } from './analytics.service.js';

export const getDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.db) {
    throw new AppError('Authentication required', 401);
  }

  // The tenant-scoped client carries the clinicId; the service no longer needs
  // it threaded in by hand — every query it runs is auto-scoped to this clinic.
  const data = await getDashboardStats(req.db);

  res.status(200).json({
    success: true,
    data
  });
});
