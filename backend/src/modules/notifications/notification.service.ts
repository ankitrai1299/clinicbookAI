import { NotificationType } from '@prisma/client';

import { forClinic } from '../../config/tenantPrisma.js';
import { publishClinicEvent } from './notification.realtime.js';

// Dashboard notification feed (the bell / notification center). The automation
// engine writes here whenever something happens that staff should see —
// especially events that originate from the WhatsApp bot rather than a staff
// click (a patient self-booking, an approval/rejection going out, etc.).
//
// Every query runs through a clinic-scoped client (forClinic), so a notification
// can never be created for, listed from, or marked read across clinics.

export interface CreateNotificationInput {
  clinicId: string;
  type: NotificationType;
  title: string;
  body: string;
  appointmentId?: string | null;
}

export const createNotification = async (input: CreateNotificationInput) => {
  const db = forClinic(input.clinicId);
  const notification = await db.notification.create({
    data: {
      clinicId: input.clinicId,
      type: input.type,
      title: input.title,
      body: input.body,
      appointmentId: input.appointmentId ?? null
    }
  });

  // Push to any live dashboard (SSE) for this clinic — instant, no poll wait.
  publishClinicEvent(input.clinicId, {
    type: 'notification',
    notificationType: notification.type,
    title: notification.title,
    body: notification.body,
    appointmentId: notification.appointmentId,
    at: notification.createdAt.toISOString()
  });

  return notification;
};

// Fire-and-forget wrapper: a notification must never block or fail the action
// that triggered it (booking, approval). Errors are logged, not thrown.
export const recordNotification = (input: CreateNotificationInput): void => {
  void createNotification(input).catch((err) =>
    console.error('[Notification] Failed to record notification:', err)
  );
};

export const listNotifications = (clinicId: string, limit = 50) =>
  forClinic(clinicId).notification.findMany({
    where: { clinicId },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

export const countUnread = (clinicId: string) =>
  forClinic(clinicId).notification.count({ where: { clinicId, read: false } });

export const markNotificationRead = (clinicId: string, id: string) =>
  forClinic(clinicId).notification.updateMany({ where: { id, clinicId }, data: { read: true } });

export const markAllNotificationsRead = (clinicId: string) =>
  forClinic(clinicId).notification.updateMany({ where: { clinicId, read: false }, data: { read: true } });
