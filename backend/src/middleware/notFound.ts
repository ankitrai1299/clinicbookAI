import { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/AppError.js';

export const notFoundHandler = (_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Route not found', 404));
};