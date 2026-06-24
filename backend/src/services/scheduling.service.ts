import { prisma } from '../config/prisma.js';

// Availability is derived from the DB (DoctorSchedule + DoctorLeave + booked
// Appointments) — never hardcoded. Times use the same "HH:MM AM/PM" format the
// rest of the system stores (e.g. "09:00 AM"), so booked-slot exclusion matches.

const parseHHMM = (s: string): number => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// minutes-from-midnight → "HH:MM AM/PM" (2-digit 12h hour).
const formatSlot = (mins: number): string => {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
};

const parseDateUTC = (dateStr: string): Date => new Date(`${dateStr}T00:00:00.000Z`);

/**
 * Normalise any reasonable time string the AI (or staff UI) might supply —
 * "9", "9:30", "9 AM", "2:30pm", "14:30", "09:00 AM" — into the canonical
 * "HH:MM AM/PM" label this system stores and that slot generation produces.
 * Returns null if the input can't be understood as a time of day.
 */
export const canonicalizeTime = (input: string): string | null => {
  const s = input.trim().toUpperCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return null;

  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];

  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  }

  if (h > 23 || min > 59) return null;
  return formatSlot(h * 60 + min);
};

/**
 * Available appointment start times for a doctor on a given date (YYYY-MM-DD).
 * Returns [] if the doctor has no active schedule that weekday, is on leave,
 * or every slot is taken.
 */
export const getAvailableSlots = async (
  clinicId: string,
  doctorId: string,
  dateStr: string
): Promise<string[]> => {
  const date = parseDateUTC(dateStr);
  if (Number.isNaN(date.getTime())) return [];

  const schedule = await prisma.doctorSchedule.findFirst({
    where: { clinicId, doctorId, dayOfWeek: date.getUTCDay(), isActive: true }
  });
  if (!schedule) return [];

  // Doctor on leave covering this date → no availability.
  const onLeave = await prisma.doctorLeave.findFirst({
    where: { doctorId, startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true }
  });
  if (onLeave) return [];

  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  const booked = await prisma.appointment.findMany({
    where: { clinicId, doctorId, appointmentDate: { gte: date, lt: next }, status: { not: 'CANCELLED' } },
    select: { appointmentTime: true }
  });
  const taken = new Set(booked.map((b) => b.appointmentTime));

  // If the date is today (UTC), drop slots already in the past.
  const now = new Date();
  const isToday = now.toISOString().slice(0, 10) === dateStr;
  const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();

  const start = parseHHMM(schedule.startTime);
  const end = parseHHMM(schedule.endTime);
  const slots: string[] = [];
  for (let t = start; t + schedule.slotMinutes <= end; t += schedule.slotMinutes) {
    if (isToday && t <= nowMins) continue;
    const label = formatSlot(t);
    if (!taken.has(label)) slots.push(label);
  }
  return slots;
};

/**
 * One day's availability summary for a doctor — used by the date picker.
 *   working   = the doctor has an active schedule that weekday AND isn't on leave
 *   available = number of still-open slots (0 when fully booked)
 * A non-working day (no schedule / on leave) is distinct from a fully-booked
 * working day, so the UI can SKIP the former and label the latter "Fully booked".
 */
export const getDateAvailability = async (
  clinicId: string,
  doctorId: string,
  dateStr: string
): Promise<{ working: boolean; available: number }> => {
  const date = parseDateUTC(dateStr);
  if (Number.isNaN(date.getTime())) return { working: false, available: 0 };

  const schedule = await prisma.doctorSchedule.findFirst({
    where: { clinicId, doctorId, dayOfWeek: date.getUTCDay(), isActive: true },
    select: { id: true }
  });
  if (!schedule) return { working: false, available: 0 };

  const onLeave = await prisma.doctorLeave.findFirst({
    where: { doctorId, startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true }
  });
  if (onLeave) return { working: false, available: 0 };

  const available = (await getAvailableSlots(clinicId, doctorId, dateStr)).length;
  return { working: true, available };
};

/** Whether a specific time string is currently bookable for that doctor/date. */
export const isSlotAvailable = async (
  clinicId: string,
  doctorId: string,
  dateStr: string,
  time: string
): Promise<boolean> => {
  const canonical = canonicalizeTime(time);
  if (!canonical) return false;
  const slots = await getAvailableSlots(clinicId, doctorId, dateStr);
  return slots.includes(canonical);
};
