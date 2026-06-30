// In-process pub/sub for real-time dashboard updates over Server-Sent Events.
//
// Single-instance backend (same model as the inbound dedup/serialization maps).
// Every dashboard notification (booking/approve/cancel/reschedule) publishes an
// event on a channel keyed by clinicId; SSE connections for that clinic receive
// it instantly. Horizontal scaling would swap this EventEmitter for Redis pub/sub.

import { EventEmitter } from 'events';

export interface RealtimeEvent {
  type: 'notification';
  notificationType: string; // e.g. APPOINTMENT_BOOKED
  title: string;
  body: string;
  appointmentId: string | null;
  at: string; // ISO timestamp
}

const bus = new EventEmitter();
// Many concurrent SSE clients per clinic — disable the default 10-listener warning.
bus.setMaxListeners(0);

export const publishClinicEvent = (clinicId: string, event: RealtimeEvent): void => {
  bus.emit(clinicId, event);
};

// Subscribe a clinic's SSE connection; returns an unsubscribe fn for cleanup.
export const subscribeClinic = (clinicId: string, listener: (event: RealtimeEvent) => void): (() => void) => {
  bus.on(clinicId, listener);
  return () => bus.off(clinicId, listener);
};
