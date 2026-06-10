import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodTypeAny } from 'zod';

import { AppError } from '../utils/AppError.js';

type ValidationSource = 'body' | 'query' | 'params';

export const validate = (schema: ZodTypeAny, source: ValidationSource = 'body'): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join(', ');
      return next(new AppError(message || 'Validation failed', 400));
    }

    req[source] = result.data as never;
    return next();
  };
};