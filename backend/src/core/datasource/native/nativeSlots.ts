// Native (Prisma/Postgres) implementation of SlotPort. The availability logic is
// lifted verbatim from scheduling.service (getAvailableSlots / getDateAvailability
// / isSlotAvailable) — same queries, same clinic-local past-slot filtering — now
// behind the port so an EMR-backed clinic can return the EMR's own free slots
// instead. The PURE slot/time math is imported from services/slotMath (shared,
// dependency-free) so nothing is duplicated and there is no circular import.

import { forClinic } from '../../../config/tenantPrisma.js';
import {
  parseHHMM,
  formatSlot,
  parseDateUTC,
  clinicNow,
  slotIsFuture,
  canonicalizeTime
} from '../../../services/slotMath.js';
import type { SlotPort } from '../ports.js';

export const nativeSlots = (clinicId: string): SlotPort => {
  const db = forClinic(clinicId);

  const getAvailable = async (doctorId: string, dateStr: string, at: Date = new Date()): Promise<string[]> => {
    const date = parseDateUTC(dateStr);
    if (Number.isNaN(date.getTime())) return [];

    const schedule = await db.doctorSchedule.findFirst({
      where: { clinicId, doctorId, dayOfWeek: date.getUTCDay(), isActive: true }
    });
    if (!schedule) return [];

    // Doctor on leave covering this date → no availability. clinicId is injected
    // by the scoped client, so another clinic's leave can't affect this one.
    const onLeave = await db.doctorLeave.findFirst({
      where: { doctorId, startDate: { lte: date }, endDate: { gte: date } },
      select: { id: true }
    });
    if (onLeave) return [];

    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    const booked = await db.appointment.findMany({
      where: { clinicId, doctorId, appointmentDate: { gte: date, lt: next }, status: { not: 'CANCELLED' } },
      select: { appointmentTime: true }
    });
    const taken = new Set(booked.map((b) => b.appointmentTime));

    // Drop any slot that isn't strictly in the future, judged in CLINIC-LOCAL
    // time (Asia/Kolkata) — past days yield nothing, today only future times.
    const now = clinicNow(at);
    const start = parseHHMM(schedule.startTime);
    const end = parseHHMM(schedule.endTime);
    const slots: string[] = [];
    for (let t = start; t + schedule.slotMinutes <= end; t += schedule.slotMinutes) {
      if (!slotIsFuture(t, dateStr, now)) continue;
      const label = formatSlot(t);
      if (!taken.has(label)) slots.push(label);
    }
    return slots;
  };

  const getDateAvailability = async (
    doctorId: string,
    dateStr: string
  ): Promise<{ working: boolean; available: number }> => {
    const date = parseDateUTC(dateStr);
    if (Number.isNaN(date.getTime())) return { working: false, available: 0 };

    const schedule = await db.doctorSchedule.findFirst({
      where: { clinicId, doctorId, dayOfWeek: date.getUTCDay(), isActive: true },
      select: { id: true }
    });
    if (!schedule) return { working: false, available: 0 };

    const onLeave = await db.doctorLeave.findFirst({
      where: { doctorId, startDate: { lte: date }, endDate: { gte: date } },
      select: { id: true }
    });
    if (onLeave) return { working: false, available: 0 };

    const available = (await getAvailable(doctorId, dateStr)).length;
    return { working: true, available };
  };

  const isAvailable = async (doctorId: string, dateStr: string, time: string): Promise<boolean> => {
    const canonical = canonicalizeTime(time);
    if (!canonical) return false;
    const slots = await getAvailable(doctorId, dateStr);
    return slots.includes(canonical);
  };

  return { getAvailable, getDateAvailability, isAvailable };
};
