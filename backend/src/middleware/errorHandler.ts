import { ErrorRequestHandler } from 'express';

import { env } from '../config/env.js';

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = 500;
  let message = 'Internal server error';

  if (typeof error === 'object' && error !== null) {
    const possibleError = error as { statusCode?: number; message?: string; name?: string; code?: string };

    if (typeof possibleError.statusCode === 'number') {
      statusCode = possibleError.statusCode;
    }

    if (typeof possibleError.message === 'string') {
      message = possibleError.message;
    }

    if (possibleError.name === 'PrismaClientKnownRequestError') {
      if (possibleError.code === 'P2002') {
        statusCode = 409;
        message = 'A record with these values already exists';
      }

      if (possibleError.code === 'P2025') {
        statusCode = 404;
        message = 'Requested resource was not found';
      }
    }
  }

  if (error instanceof SyntaxError && 'body' in error) {
    statusCode = 400;
    message = 'Invalid JSON payload';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(env.NODE_ENV === 'production' ? {} : { stack: error instanceof Error ? error.stack : undefined })
  });
};