import { NextFunction, Request, Response } from 'express';

import { verifyAccessToken } from '../config/jwt.js';
import { AppError } from '../utils/AppError.js';

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }

  const token = header.slice(7).trim();

  try {
    const payload = verifyAccessToken(token);
    // Doctor-portal tokens must never unlock the admin/clinic API. They carry a
    // doctorId in `userId` (not a real User) and are confined to /api/doctor-portal.
    if (payload.role === 'DOCTOR') {
      return next(new AppError('Invalid token for this resource', 403));
    }
    req.user = payload;
    return next();
  } catch {
    return next(new AppError('Invalid or expired token', 401));
  }
};