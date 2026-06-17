import { NextFunction, Request, Response } from 'express';

import { verifyAccessToken } from '../config/jwt.js';
import { AppError } from '../utils/AppError.js';

// Gate for the Doctor Portal. Accepts ONLY doctor tokens (role === 'DOCTOR').
// On success, req.user carries { userId: doctorId, clinicId: platformClinicId }.
export const requireDoctorAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }

  const token = header.slice(7).trim();

  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== 'DOCTOR') {
      return next(new AppError('Doctor access required', 403));
    }
    req.user = payload;
    return next();
  } catch {
    return next(new AppError('Invalid or expired token', 401));
  }
};
