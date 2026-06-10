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
    req.user = verifyAccessToken(token);
    return next();
  } catch {
    return next(new AppError('Invalid or expired token', 401));
  }
};