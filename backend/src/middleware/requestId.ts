// Give every request an id, echo it back, and put it on the request so the error
// handler can log it.
//
// It exists so a support message — "a booking failed around 3pm" — becomes a
// single log lookup instead of a guess. The id is returned on 5xx responses too,
// so a clinic can quote the exact failure rather than describe it.
//
// An inbound X-Request-Id is honoured (a proxy or the frontend may already have
// one) but length-capped, since it lands in logs.

import type { NextFunction, Request, Response } from 'express';

import { newRequestId } from '../utils/observability.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && incoming.length <= 100 ? incoming : newRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
