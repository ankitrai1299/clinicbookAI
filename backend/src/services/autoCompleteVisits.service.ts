// Automatic post-visit completion + prescription hand-off.
//
// The idea (from the clinic operator): a booked slot has a start time and a
// duration. Once that slot has ended, we can tell whether the patient actually
// came WITHOUT staff clicking "Mark Completed" — because if the doctor saw them,
// they used MediScribe (a finalized consultation exists for that patient). So:
//   • scribe WAS used for the patient  → auto-mark the visit COMPLETED (which
//     fires the existing thank-you message) AND send them their prescription.
//   • scribe was NOT used              → after a grace period, mark it NO_SHOW,
//     which offers the patient a new slot.
//
// The second half used to be "leave it for staff to complete manually", and in
// practice nothing ever completed it: a booking with no scribe note sat
// CONFIRMED in the roster for good, and the patient who missed the visit heard
// nothing. Both halves are now closed automatically.
//
// The inference is not certain — a doctor can see a patient without opening the
// scribe — so two things protect against a wrong guess: NO_SHOW is correctable
// (see the transition table), and the message never says the patient failed to
// attend.
//
// Cross-product composition (ClinicBook appointments + MediScribe notes + WhatsApp)
// lives here in the shared services layer, never inside a product module.

import { AppointmentStatus } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import {
  completeAppointment,
  markNoShowAppointment,
  type AppointmentRecord
} from '../core/appointments/appointment.service.js';
import { registerPostVisitAction } from '../core/appointments/postVisit.service.js';
import { finalizedScribeForPatient, type ScribeReport } from '../products/novascribe/skills/mediscribeData.js';
import { sendTemplatedOrSession } from '../core/whatsapp/whatsapp.service.js';
import { WhatsAppTemplate, medicineReminderComponents } from '../core/whatsapp/whatsapp.templates.js';
import { clinicLocalInstant } from './scheduling.service.js';
import { parseFrequencyTimes, medicineLabel } from './medicineReminder.frequency.js';

const DEFAULT_SLOT_MIN = 30; // when a doctor's schedule doesn't specify one

/**
 * How long after a slot ends before an unaccounted-for visit is called a
 * no-show.
 *
 * The whole inference is "no scribe note means the patient never came", and the
 * commonest way for that to be WRONG is simply that the doctor has not saved
 * the note yet. This grace is what separates "still writing it up" from "did
 * not attend"; without it the sweep would race the doctor and text a patient
 * who is still in the room.
 */
const NO_SHOW_GRACE_MIN = 30;

/**
 * PURE: the day an appointment is for, as YYYY-MM-DD.
 *
 * Appointment dates are stored at UTC midnight for a clinic-local day, so the
 * UTC calendar day IS the clinic's day — going through a timezone here would
 * shift it.
 */
export const dateStrOf = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * PURE: the day a scribe note is for, as YYYY-MM-DD.
 *
 * The scribe writes `date` with the browser's own formatting, which in India is
 * `d/m/yyyy` and unpadded — "18/8/2026", not "18/08/2026". Day comes first;
 * reading it as m/d would move a consultation by months.
 *
 * Anything it cannot read returns null, and the caller treats that as "belongs
 * to no day" rather than guessing at one.
 */
export const noteDateStr = (raw: unknown): string | null => {
  const v = String(raw ?? '').trim();
  if (!v) return null;

  // d/m/yyyy or dd/mm/yyyy, the scribe's own format.
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = Number(d);
    const month = Number(m);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // An ISO date, or an ISO timestamp — accepted because a future writer may
  // store one and the rest of this file already speaks ISO.
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/.exec(v);
  if (iso) {
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  return null;
};

/**
 * PURE: what a stored consultation says about the visit it belongs to.
 *
 *   'finalized'  the doctor finished and a report exists — the visit is done
 *   'started'    opened and not finished — the visit is still in progress
 *   null         no usable date, so it speaks for no particular day
 *
 * The middle state is the one worth naming. A consultation under way must stop
 * the sweep touching that appointment at all: without it the grace period was a
 * deadline, and a doctor still mid-consultation — or writing up after the clinic
 * emptied — had the visit swept to NO_SHOW out from under them.
 */
export const noteState = (
  data: { status?: string; report?: unknown; date?: unknown } | null | undefined
): { state: 'finalized' | 'started'; on: string } | null => {
  const on = noteDateStr(data?.date);
  if (!on) return null;
  return { state: data?.status === 'Completed' && data?.report ? 'finalized' : 'started', on };
};



const to12h = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}`;
};

// A patient-friendly, "when to take" prescription (the full detail — sent in-window).
const formatPrescriptionBody = (patientName: string, clinicName: string, report: ScribeReport): string => {
  const meds = report.prescribedMedications || [];
  const lines: string[] = [`💊 *Your prescription* — ${clinicName}`, `Hello ${patientName}, please take:`, ''];
  meds.forEach((m, i) => {
    const label = medicineLabel(m);
    const times = parseFrequencyTimes(m.frequency || m.instructions || '');
    const when = times.length ? ` — ${times.map(to12h).join(', ')}` : m.frequency ? ` — ${m.frequency}` : '';
    const dur = m.duration ? ` (${m.duration})` : '';
    lines.push(`${i + 1}. ${label}${when}${dur}`);
  });
  if (report.advice?.length) lines.push('', `📝 Advice: ${report.advice.join('; ')}`);
  lines.push('', 'ℹ️ Reminders will be sent at each dose time. Any doubt? Ask the clinic. Not a substitute for medical advice.');
  return lines.join('\n');
};

// A compact one-liner for the approved template's {{2}} slot (out-of-window path).
const prescriptionSummary = (report: ScribeReport): string => {
  const names = (report.prescribedMedications || []).map((m) => m.medicine).filter(Boolean);
  const head = names.slice(0, 4).join(', ');
  return (names.length > 4 ? `${head} +${names.length - 4} more` : head) || 'your prescribed medicines';
};

/**
 * Post-visit action: send the patient their prescription. Fires on EVERY
 * completion (manual or auto) but only when a finalized scribe prescription with
 * medicines exists — so a completed visit with no scribe note sends nothing extra.
 */
export const sendScribePrescription = async (appt: AppointmentRecord): Promise<void> => {
  const phone = appt.patient?.phone;
  if (!phone) return;
  const scribe = await finalizedScribeForPatient(appt.clinicId, appt.patientId);
  if (!scribe?.report?.prescribedMedications?.length) return;

  const patientName = appt.patient?.name ?? 'there';
  const clinicName = appt.clinic?.name ?? 'your clinic';
  await sendTemplatedOrSession({
    to: phone,
    templateName: WhatsAppTemplate.MEDICINE_REMINDER,
    components: medicineReminderComponents({ patientName, medicine: prescriptionSummary(scribe.report), clinicName }),
    sessionBody: formatPrescriptionBody(patientName, clinicName, scribe.report),
    clinicId: appt.clinicId
  }).catch((e) => console.error('[autoComplete] prescription send failed:', e));
};

/** Register the prescription hand-off so it runs after ANY visit completion. */
export const registerAutoCompleteActions = (): void => {
  registerPostVisitAction((appt) => {
    void sendScribePrescription(appt);
  });
};

// PURE: when a booked slot ends, given its doctor's slot length.
export const slotEndInstant = (
  appt: { appointmentDate: Date; appointmentTime: string },
  slotMinutes: number
): Date => new Date(clinicLocalInstant(appt.appointmentDate, appt.appointmentTime).getTime() + slotMinutes * 60_000);

const scheduleKey = (doctorId: string, dayOfWeek: number) => `${doctorId}|${dayOfWeek}`;
const patientDayKey = (clinicId: string, patientId: string, date: Date) =>
  `${clinicId}|${patientId}|${date.toISOString().slice(0, 10)}`;

/**
 * SAFETY NET, not the primary path. Since mediscribe/appointmentCompletion.ts, a
 * visit closes the instant the doctor finalizes the note. This sweep exists for
 * the cases that hook cannot cover: notes finalized before it existed, or a save
 * whose completion never landed (restart mid-request).
 *
 * Rules: the slot must have ENDED, the doctor must have used the scribe, and the
 * patient must have exactly ONE live appointment that day. The last condition
 * matters because this scan matches per PATIENT, not per visit — with two
 * bookings the same day it cannot tell which one the note documents, and
 * completing both would thank the patient for a visit that never happened.
 */
export const processAutoCompleteVisits = async (): Promise<void> => {
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 1);
  from.setUTCHours(0, 0, 0, 0);

  // Cross-tenant scan (like the reminder cron); each write is re-scoped by clinicId.
  const appts = await prisma.appointment.findMany({
    where: { status: AppointmentStatus.CONFIRMED, appointmentDate: { gte: from } },
    select: { id: true, clinicId: true, doctorId: true, patientId: true, appointmentDate: true, appointmentTime: true }
  });

  if (!appts.length) return;

  // ── Batched lookups ──────────────────────────────────────────────────────
  // Every lookup below used to sit INSIDE the loop, so a sweep cost roughly
  // three queries per candidate appointment and ran every five minutes whether
  // or not anything was due. At a hundred clinics that is thousands of queries
  // per sweep for, usually, nothing. Same decisions, three queries.

  // 1. Slot lengths. @@unique([doctorId, dayOfWeek]) so doctor+day is the key.
  const schedules = await prisma.doctorSchedule.findMany({
    where: { doctorId: { in: [...new Set(appts.map((a) => a.doctorId))] }, isActive: true },
    select: { doctorId: true, dayOfWeek: true, slotMinutes: true }
  });
  const slotMinutes = new Map(schedules.map((s) => [scheduleKey(s.doctorId, s.dayOfWeek), s.slotMinutes]));

  // Only appointments whose slot has ENDED need the remaining lookups, so narrow
  // before spending them.
  const ended = appts.filter(
    (a) =>
      slotEndInstant(a, slotMinutes.get(scheduleKey(a.doctorId, a.appointmentDate.getUTCDay())) ?? DEFAULT_SLOT_MIN) <=
      now
  );
  if (!ended.length) return;

  // 2. How many live appointments each patient has that day — one groupBy
  // instead of a count() per appointment. appointmentDate is stored at midnight
  // UTC, so it groups cleanly per calendar day.
  const dayCounts = await prisma.appointment.groupBy({
    by: ['clinicId', 'patientId', 'appointmentDate'],
    where: {
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      patientId: { in: [...new Set(ended.map((a) => a.patientId))] },
      appointmentDate: { gte: from }
    },
    _count: { _all: true }
  });
  const liveThatDay = new Map(
    dayCounts.map((g) => [patientDayKey(g.clinicId, g.patientId, g.appointmentDate), g._count._all])
  );

  // 3. Finalized scribe notes, one query per clinic in the sweep (NovaDoc is
  // keyed by clinic, and the (clinicId, collection, patientId) index covers it).
  const byClinic = new Map<string, string[]>();
  for (const a of ended) {
    if (!byClinic.has(a.clinicId)) byClinic.set(a.clinicId, []);
    byClinic.get(a.clinicId)!.push(a.patientId);
  }
  //
  // Keyed by clinic|patient|DATE, not clinic|patient. Without the date, one
  // finished consultation completed every future appointment that patient ever
  // had: a note from the 8th closed a booking on the 12th, the doctor never saw
  // it in their queue, and a visit nobody attended was recorded as done — and a
  // visit recorded as done can be pushed into that person's national health
  // record, where it cannot be taken back.
  const hasFinalizedScribe = new Set<string>();
  // A consultation the doctor has STARTED but not finished. The sweep leaves
  // these alone entirely — see the decision loop.
  const scribeInProgress = new Set<string>();

  for (const [clinicId, patientIds] of byClinic) {
    const rows = await prisma.novaDoc.findMany({
      where: { clinicId, collection: 'consultations', patientId: { in: [...new Set(patientIds)] } },
      select: { patientId: true, data: true }
    });
    for (const r of rows) {
      const d = r.data as { status?: string; report?: unknown; date?: unknown } | null;
      if (!r.patientId) continue;

      // A note with no readable date cannot be attributed to a day, so it
      // attributes to none. That lands the visit on NO_SHOW, which a human can
      // correct; the other direction cannot be undone.
      const note = noteState(d);
      if (!note) continue;

      const key = `${clinicId}|${r.patientId}|${note.on}`;
      if (note.state === 'finalized') hasFinalizedScribe.add(key);
      else scribeInProgress.add(key);
    }
  }

  // ── Decide + complete ────────────────────────────────────────────────────
  for (const a of ended) {
    try {
      const dayKey = `${a.clinicId}|${a.patientId}|${dateStrOf(a.appointmentDate)}`;

      // ── A consultation already under way ─────────────────────────────────
      //
      // The doctor opened the scribe for this patient, on this day, and has not
      // finished. Leave the appointment exactly as it is: still live, still in
      // their queue, waiting to be finished.
      //
      // Without this the grace period was a deadline. Thirty minutes after the
      // slot the visit was swept to NO_SHOW and vanished from the queue — while
      // the doctor was mid-consultation, or writing it up after the clinic
      // emptied. A long appointment was punished for being long.
      //
      // Nothing is lost by waiting: finalising the scribe completes the visit
      // itself, and an abandoned draft leaves the booking live, where a person
      // can see it and decide.
      if (scribeInProgress.has(dayKey)) {
        console.info(`[AutoComplete] Visit ${a.id} left alone — a consultation for this patient is open today.`);
        continue;
      }

      if (!hasFinalizedScribe.has(dayKey)) {
        // No note anywhere for this patient, so there is nothing to attribute
        // and the same-day ambiguity below cannot arise: if they had two
        // bookings that day, they missed both.
        const slotMin = slotMinutes.get(scheduleKey(a.doctorId, a.appointmentDate.getUTCDay())) ?? DEFAULT_SLOT_MIN;
        if (slotEndInstant(a, slotMin + NO_SHOW_GRACE_MIN) > now) continue; // still within grace
        await markNoShowAppointment(a.clinicId, a.id);
        console.info(`[AutoComplete] Visit ${a.id} marked no-show (no scribe note ${NO_SHOW_GRACE_MIN}m after the slot).`);
        continue;
      }

      // Per-PATIENT matching can't disambiguate two bookings on one day.
      const sameDay = liveThatDay.get(patientDayKey(a.clinicId, a.patientId, a.appointmentDate)) ?? 1;
      if (sameDay > 1) {
        console.info(
          `[AutoComplete] Visit ${a.id} skipped — patient has ${sameDay} live appointments that day, cannot tell which the note documents.`
        );
        continue;
      }

      // completeAppointment, NOT updateAppointment. updateAppointment writes the
      // status but does NOT run runPostVisitWorkflow, set completedAt/completedBy,
      // record the staff notification, or guard the write against a concurrent
      // completion — so this sweep used to close visits silently, without the
      // thank-you or the prescription hand-off this module exists to send.
      await completeAppointment(a.clinicId, a.id, 'auto-complete');
      console.info(`[AutoComplete] Visit ${a.id} auto-completed (scribe used); post-visit workflow fired.`);
    } catch (err) {
      console.error(`[AutoComplete] Failed appointment ${a.id}:`, err);
    }
  }
};
