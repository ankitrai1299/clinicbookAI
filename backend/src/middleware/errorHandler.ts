import { ErrorRequestHandler } from 'express';

import { reportError } from '../utils/observability.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
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

  // Never leak internals to the client. Full detail (incl. stack) is logged
  // server-side; 5xx responses return a generic message regardless of env.
  if (statusCode >= 500) {
    const user = (req as typeof req & { user?: { clinicId?: string; userId?: string } }).user;
    reportError(error, {
      requestId: req.requestId,
      method: req.method,
      // req.path only — a query string can carry a phone number or a patient id.
      path: req.path,
      statusCode,
      clinicId: user?.clinicId,
      userId: user?.userId
    });
    message = 'Internal server error';
    // Returned so a clinic reporting a failure can quote the exact request.
    res.status(statusCode).json({ success: false, message, requestId: req.requestId });
    return;
  }

  res.status(statusCode).json({ success: false, message });
};