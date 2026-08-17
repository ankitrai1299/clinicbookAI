import { Router } from 'express';

import { requirePermission } from '../authz/requirePermission.js';
import { requireAuth } from '../../middleware/auth.js';
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
// Clinic notifications are about bookings — the same audience as the roster.
notificationRouter.use(requirePermission('appointment.read'));

notificationRouter.get('/', listNotificationsHandler);
notificationRouter.patch('/read-all', markAllNotificationsReadHandler);
notificationRouter.patch('/:id/read', markNotificationReadHandler);

export default notificationRouter;
