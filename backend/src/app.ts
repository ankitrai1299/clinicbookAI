import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './middleware/logger.js';
import { notFoundHandler } from './middleware/notFound.js';

const parseCorsOrigins = () => {
  if (env.CORS_ORIGIN.trim() === '*') {
    return true;
  }

  return env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
};

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: parseCorsOrigins(),
      credentials: true
    })
  );
  app.use(express.json({ limit: '1mb' }));
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