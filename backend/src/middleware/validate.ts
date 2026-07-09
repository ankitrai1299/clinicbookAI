import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodTypeAny } from 'zod';

import { AppError } from '../utils/AppError.js';

type ValidationSource = 'body' | 'query' | 'params';

export const validate = (schema: ZodTypeAny, source: ValidationSource = 'body'): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      // Prefix each issue with the field it belongs to. Without this, a body
      // missing four fields reports "Required, Required, Required, Required",
      // which is useless to a partner integrating against the public API.
      const message = result.error.issues
        .map((issue) => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join(', ');
      return next(new AppError(message || 'Validation failed', 400));
    }

    req[source] = result.data as never;
    return next();
  };
};