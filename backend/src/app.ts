import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import { stripeWebhookHandler } from './core/billing/billing.controller.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './middleware/logger.js';
import { notFoundHandler } from './middleware/notFound.js';
import { registerNovaScribeSubscriptions } from './products/novascribe/novascribe.subscriptions.js';

const parseCorsOrigins = () => {
  if (env.CORS_ORIGIN.trim() === '*') {
    return true;
  }

  return env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
};

export const createApp = () => {
  const app = express();

  // Wire product event subscriptions (NovaScribe reacts to ClinicBook's
  // appointment.completed). Idempotent — safe to call on every app build.
  registerNovaScribeSubscriptions();

  app.disable('x-powered-by');
  // Behind Railway's proxy: trust the first hop so express-rate-limit keys on the
  // real client IP (X-Forwarded-For) instead of the proxy address.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: parseCorsOrigins(),
      credentials: true
    })
  );
  // Stripe webhook needs raw body — must be mounted before express.json()
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);
  // Stash the raw request bytes so the WhatsApp webhook can verify Meta's
  // X-Hub-Signature-256 HMAC against the exact payload.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      }
    })
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(logger);
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 200,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use(apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};