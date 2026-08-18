import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { requirePermission } from '../authz/requirePermission.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { registerDevice, unregisterDevice } from './push.service.js';
import {
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
  notificationStreamHandler
} from './notification.controller.js';

const notificationRouter = Router();

// SSE stream authenticates via ?token= (EventSource can't set headers), so it is
// registered BEFORE the header-based requireAuth guard below.
notificationRouter.get('/stream', notificationStreamHandler);

notificationRouter.use(requireAuth);

// ── Device registration for push ────────────────────────────────────────────
//
// Deliberately NOT behind requirePermission: every signed-in person needs their
// own phone to buzz, whatever their role. The device is bound to the caller's
// own user and clinic from their token, never from the body, so registering
// somebody else's device is not expressible.
const deviceSchema = z.object({
  token: z.string().trim().min(10).max(200),
  product: z.enum(['clinicbook', 'mediscribe']),
  platform: z.string().trim().max(20).optional()
});

notificationRouter.post(
  '/devices',
  validate(deviceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof deviceSchema>;
    try {
      await registerDevice({
        clinicId: req.user!.clinicId,
        userId: req.user!.userId,
        token: body.token,
        product: body.product,
        platform: body.platform
      });
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : 'Could not register this device', 400);
    }
    res.status(201).json({ success: true, data: { registered: true } });
  })
);

/** Sign-out, or notifications turned off. A shared phone must stop buzzing. */
notificationRouter.delete(
  '/devices/:token',
  asyncHandler(async (req: Request, res: Response) => {
    await unregisterDevice(req.params.token);
    res.json({ success: true, data: { registered: false } });
  })
);

// Clinic notifications are about bookings — the same audience as the roster.
notificationRouter.use(requirePermission('appointment.read'));


notificationRouter.get('/', listNotificationsHandler);
notificationRouter.patch('/read-all', markAllNotificationsReadHandler);
notificationRouter.patch('/:id/read', markNotificationReadHandler);

export default notificationRouter;
