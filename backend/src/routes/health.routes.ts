import { Router } from 'express';

import { env } from '../config/env.js';
import { healthCheckDatabase } from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const healthRouter = Router();

healthRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    await healthCheckDatabase();

    res.status(200).json({
      success: true,
      message: 'ClinicBook AI backend is healthy',
      data: {
        status: 'ok',
        database: 'connected',
        environment: env.NODE_ENV,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    });
  })
);

export default healthRouter;