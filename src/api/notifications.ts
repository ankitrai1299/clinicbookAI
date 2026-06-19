import { apiFetch } from './client';

export interface ApiNotification {
  id: string;
  clinicId: string;
  type: 'APPOINTMENT_BOOKED' | 'APPOINTMENT_CONFIRMED' | 'APPOINTMENT_CANCELLED' | 'APPOINTMENT_RESCHEDULED';
  title: string;
  body: string;
  appointmentId: string | null;
  read: boolean;
  createdAt: string;
}

// Backend returns { data: ApiNotification[], unread }. apiFetch unwraps `.data`;
// unread is derived client-side from `read` so we don't depend on the extra field.
export const getNotifications = () => apiFetch<ApiNotification[]>('/api/notifications');

export const markAllNotificationsRead = () =>
  apiFetch<void>('/api/notifications/read-all', { method: 'PATCH' });

export const markNotificationRead = (id: string) =>
  apiFetch<void>(`/api/notifications/${id}/read`, { method: 'PATCH' });
