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
import { registerClinicBookCapabilities } from './products/clinicbook/clinicbook.capabilities.js';
import { registerEmrIntegration } from './integrations/emr/index.js';
import { registerWebhookSubscriptions } from './core/webhooks/webhook.subscriptions.js';
import { registerClinicBookSkills } from './products/clinicbook/skills/booking.skill.js';
import { registerClinicBookStatusSkill } from './products/clinicbook/skills/status.skill.js';
import { registerNovaScribeSkills } from './products/novascribe/skills/prescription.skill.js';
import { registerNovaScribeDocumentsSkill } from './products/novascribe/skills/documents.skill.js';
import { setIntentClassifier } from './core/mcp/index.js';
import { mcpIntentClassifier } from './core/ai/mcp.classifier.js';
import { MEDISCRIBE_UPLOADS_DIR } from './products/mediscribe/router.js';

const parseCorsOrigins = () => {
  if (env.CORS_ORIGIN.trim() === '*') {
    return true;
  }

  return env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
};

export const createApp = () => {
  const app = express();

  // Wire the platform brain + product event subscriptions. Both are idempotent,
  // so calling on every app build (incl. tests) is safe.
  //  - Products register their MCP capabilities (ClinicBook: appointment.*).
  //  - Products register their conversational skills (ClinicBook: booking).
  //  - The brain's NL understanding is backed by core/ai.
  //  - The patient-facing MediScribe skills (prescription/documents) answer
  //    WhatsApp requests for a patient's scribe records.
  registerClinicBookCapabilities();
  registerClinicBookSkills();
  registerClinicBookStatusSkill();
  registerNovaScribeSkills();
  registerNovaScribeDocumentsSkill();
  setIntentClassifier(mcpIntentClassifier);
  // Bridge domain events to the outbound-webhook outbox. The handler only writes
  // a delivery row; webhook.cron owns the HTTP, retries and giving up.
  registerWebhookSubscriptions();
  // Plug external-EMR data sources into the resolver (config-gated via
  // EMR_MOCK_CLINICS; blank → every clinic stays native). Dependency inversion:
  // core/datasource never imports integrations.
  registerEmrIntegration();

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
      // A single dashboard load fires ~10 API calls (ClinicBook + MediScribe both
      // fan out), so 200/15min tripped 429s for normal active users. 1500 keeps
      // comfortable headroom while still blocking real abuse. Override via
      // RATE_LIMIT_MAX. Health checks are exempt so uptime pings never count.
      limit: Number(process.env.RATE_LIMIT_MAX) || 1500,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/health'
    })
  );

  // NovaScribe consultation audio — served unprotected (an <audio> element can't
  // send an auth header). Filenames embed a timestamp so they're unguessable.
  // helmet() sets Cross-Origin-Resource-Policy: same-origin globally, which blocks
  // the cross-origin <audio> element (frontend on a different domain than this API)
  // from loading these files (net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin). Override
  // CORP to cross-origin for just this static route so playback/download works.
  // MediScribe's persisted audio (unauthenticated static so <audio> can load it;
  // filenames are unguessable timestamps).
  app.use(
    '/api/mediscribe/uploads',
    express.static(MEDISCRIBE_UPLOADS_DIR, {
      maxAge: '1y',
      immutable: true,
      setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    })
  );

  app.use(apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};