import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { verifyAccessToken } from '../../config/jwt.js';
import { subscribeClinic } from './notification.realtime.js';
import {
  countUnread,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from './notification.service.js';

const getClinicId = (req: Request) => {
  const clinicId = req.user?.clinicId;
  if (!clinicId) {
    throw new AppError('Authentication required', 401);
  }
  return clinicId;
};

export const listNotificationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  const [notifications, unread] = await Promise.all([
    listNotifications(clinicId),
    countUnread(clinicId)
  ]);

  res.status(200).json({ success: true, data: notifications, unread });
});

// GET /api/notifications/stream — Server-Sent Events for real-time dashboard
// updates. EventSource can't send an Authorization header, so the JWT is passed
// as ?token= (or a Bearer header for non-browser clients) and verified here.
export const notificationStreamHandler = (req: Request, res: Response) => {
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : '';
  const token = (typeof req.query.token === 'string' ? req.query.token : '') || headerToken;

  let clinicId: string;
  try {
    const payload = verifyAccessToken(token);
    if (payload.role === 'DOCTOR') {
      res.status(403).end();
      return;
    }
    clinicId = payload.clinicId;
  } catch {
    res.status(401).end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disable proxy buffering (nginx/Railway) so events flush immediately.
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 5000\n\n');
  res.write('event: connected\ndata: {"ok":true}\n\n');

  const send = (event: { type: string }) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const unsubscribe = subscribeClinic(clinicId, send);

  // Keep-alive comment ping so idle connections aren't dropped by proxies.
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
    res.end();
  });
};

export const markNotificationReadHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  await markNotificationRead(clinicId, req.params.id);
  res.status(200).json({ success: true, message: 'Notification marked as read' });
});

export const markAllNotificationsReadHandler = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = getClinicId(req);
  await markAllNotificationsRead(clinicId);
  res.status(200).json({ success: true, message: 'All notifications marked as read' });
});
