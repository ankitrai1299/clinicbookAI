// Patient Timeline — the append-only event stream that is the spine of the
// platform. Every meaningful action writes ONE event here. It is read three ways:
//   1. the Healthcare Brain's patient context (what happened, when),
//   2. the doctor's Patient Timeline UI,
//   3. the clinic's audit trail.
//
// recordEvent() is FIRE-AND-FORGET and never throws: a timeline write must never
// break the action that produced it (a booking, a note save, a reminder send).

import { prisma } from '../../config/prisma.js';

export type PatientEventType =
  | 'registered'
  | 'booked'
  | 'confirmed'
  | 'reminded'
  | 'no_show'
  | 'visited'
  | 'note_finalized'
  | 'prescribed'
  | 'lab_ordered'
  | 'follow_up_set'
  | 'refill_due'
  | 'message_in'
  | 'message_out';

export interface RecordEventInput {
  clinicId: string;
  patientId: string;
  type: PatientEventType;
  title: string;
  detail?: string;
  actorType?: 'patient' | 'doctor' | 'staff' | 'system';
  actorName?: string;
  refType?: 'appointment' | 'consultation' | 'prescription' | 'reminder';
  refId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Append one event to a patient's timeline. Never throws — errors are logged and
 * swallowed so the caller's flow is unaffected. No-op without clinic + patient.
 */
export const recordEvent = async (e: RecordEventInput): Promise<void> => {
  try {
    if (!e.clinicId || !e.patientId || !e.type || !e.title) return;
    await prisma.patientEvent.create({
      data: {
        clinicId: e.clinicId,
        patientId: e.patientId,
        type: e.type,
        title: e.title.slice(0, 300),
        detail: e.detail,
        actorType: e.actorType ?? 'system',
        actorName: e.actorName,
        refType: e.refType,
        refId: e.refId,
        meta: e.meta as never
      }
    });
  } catch (err) {
    console.error('[timeline] recordEvent failed:', err);
  }
};

/** Fire-and-forget helper — schedule an event without awaiting it. */
export const emitEvent = (e: RecordEventInput): void => {
  void recordEvent(e);
};

export interface TimelineItem {
  id: string;
  type: string;
  title: string;
  detail: string | null;
  actorType: string;
  actorName: string | null;
  refType: string | null;
  refId: string | null;
  at: string;
}

/** A patient's timeline, newest first. Read-only. */
export const getPatientTimeline = async (
  clinicId: string,
  patientId: string,
  limit = 100
): Promise<TimelineItem[]> => {
  const rows = await prisma.patientEvent.findMany({
    where: { clinicId, patientId },
    orderBy: { at: 'desc' },
    take: Math.min(Math.max(limit, 1), 300),
    select: {
      id: true,
      type: true,
      title: true,
      detail: true,
      actorType: true,
      actorName: true,
      refType: true,
      refId: true,
      at: true
    }
  });
  return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
};
