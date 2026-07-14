import { AppointmentStatus, Prisma, ReminderType } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { formatDoctorName, normalizeDoctorName } from '../utils/doctorName.js';
import { sendTemplatedOrSession } from '../core/whatsapp/whatsapp.service.js';
import { clinicLocalInstant } from './scheduling.service.js';
import {
  AppointmentTemplateData,
  WhatsAppTemplate,
  appointmentReminderComponents
} from '../core/whatsapp/whatsapp.templates.js';

// The 24-hour reminder is opt-in (set REMINDER_24H_ENABLED=true). The 1-hour
// reminder always runs when the cron is enabled — that's the one clinics asked
// for ("ek ghanta pehle").
const reminder24hEnabled = process.env.REMINDER_24H_ENABLED === 'true';

const CRON_WINDOW_MS = 10 * 60 * 1000; // match cron interval — prevents double-sends

const isInReminderWindow = (apptDateTime: Date, targetOffsetMs: number): boolean => {
  const diff = apptDateTime.getTime() - Date.now();
  return diff >= targetOffsetMs - CRON_WINDOW_MS && diff < targetOffsetMs + CRON_WINDOW_MS;
};

const build24hMessage = (
  patientName: string,
  doctorName: string,
  clinicName: string,
  dateLabel: string,
  time: string
): string =>
  `Hello ${patientName}!\n\nThis is a reminder that you have an appointment tomorrow.\n\nDate: ${dateLabel}\nTime: ${time}\nDoctor: ${formatDoctorName(doctorName)}\nClinic: ${clinicName}\n\nPlease arrive 10 minutes early. Contact us if you need to reschedule.`;

const build1hMessage = (
  patientName: string,
  doctorName: string,
  clinicName: string,
  dateLabel: string,
  time: string
): string =>
  `Hello ${patientName}!\n\nYour appointment is in 1 hour.\n\nDate: ${dateLabel}\nTime: ${time}\nDoctor: ${formatDoctorName(doctorName)}\nClinic: ${clinicName}\n\nSee you soon!`;

const dispatchReminder = async (params: {
  appointmentId: string;
  type: ReminderType;
  phone: string;
  clinicId: string;
  sessionBody: string;
  templateData: AppointmentTemplateData;
  existingReminderId: string | undefined;
}): Promise<'session' | 'template' | 'skipped'> => {
  // Claim the reminder BEFORE sending. If no row exists yet we insert one
  // (sent:false); the @@unique([appointmentId, type]) index makes a concurrent
  // run's insert fail with P2002, so only one cron run proceeds to actually
  // send — preventing duplicate reminders even if two runs overlap.
  // Reminder has NO clinicId column — it is owned via appointmentId (itself
  // clinic-scoped), so the tenant engine does not apply here and these use the
  // raw client by design. Tenant safety comes from the appointmentId, which was
  // produced by the clinic-scoped appointment scan in processReminders.
  let reminderId = params.existingReminderId;
  if (!reminderId) {
    try {
      const created = await prisma.reminder.create({
        data: { appointmentId: params.appointmentId, type: params.type, sent: false }
      });
      reminderId = created.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Another run already claimed (and is sending/sent) this reminder.
        return 'skipped';
      }
      throw err;
    }
  }

  // Inside the 24h window the patient gets the richer free-form message;
  // outside it, the approved appointment_reminder template is used instead.
  const { channel } = await sendTemplatedOrSession({
    to: params.phone,
    templateName: WhatsAppTemplate.APPOINTMENT_REMINDER,
    components: appointmentReminderComponents(params.templateData),
    sessionBody: params.sessionBody,
    clinicId: params.clinicId
  });

  // Mark sent only after a successful send. If the send threw, the claimed row
  // stays sent:false and a later run retries it (at-least-once, never twice).
  await prisma.reminder.update({
    where: { id: reminderId },
    data: { sent: true }
  });

  return channel;
};

export const processReminders = async (): Promise<void> => {
  const now = new Date();

  // Fetch today + tomorrow so we can cover 24h and 2h windows without timezone edge cases
  const todayUtcMidnight = new Date(now);
  todayUtcMidnight.setUTCHours(0, 0, 0, 0);

  const dayAfterTomorrowUtcMidnight = new Date(todayUtcMidnight);
  dayAfterTomorrowUtcMidnight.setUTCDate(dayAfterTomorrowUtcMidnight.getUTCDate() + 2);

  // DELIBERATE cross-tenant scan: the reminder cron sweeps CONFIRMED
  // appointments across ALL clinics, so it uses the raw client. Every row carries
  // its own clinicId (appt.clinicId), which is threaded into the per-clinic
  // WhatsApp send below — so a clinic's reminder always uses that clinic's
  // context and no cross-tenant leak is possible.
  const appointments = await prisma.appointment.findMany({
    where: {
      // Only CONFIRMED appointments get reminders. PENDING (awaiting clinic
      // approval), CANCELLED/rejected, COMPLETED and NO_SHOW must never trigger
      // a "your appointment is in 1 hour" message — that was the prior bug.
      status: AppointmentStatus.CONFIRMED,
      appointmentDate: {
        gte: todayUtcMidnight,
        lt: dayAfterTomorrowUtcMidnight
      }
    },
    include: {
      patient: { select: { name: true, phone: true } },
      doctor: { select: { name: true } },
      clinic: { select: { name: true } },
      reminders: { select: { id: true, type: true, sent: true } }
    }
  });

  for (const appt of appointments) {
    try {
      const apptDateTime = clinicLocalInstant(appt.appointmentDate, appt.appointmentTime);
      const dateLabel = appt.appointmentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC'
      });

      const { name: patientName, phone } = appt.patient;
      // No phone on file → nothing to remind to; skip (never fabricate a number).
      if (!phone) continue;
      const { name: doctorName } = appt.doctor;
      const { name: clinicName } = appt.clinic;

      const templateData: AppointmentTemplateData = {
        patientName,
        dateLabel,
        time: appt.appointmentTime,
        // Meta's approved template body already prints "Dr.", so pass the BARE
        // normalized name to avoid a "Dr. Dr. X" double prefix on that channel.
        doctorName: normalizeDoctorName(doctorName),
        clinicName
      };

      // 24-hour reminder (opt-in via REMINDER_24H_ENABLED)
      if (reminder24hEnabled && isInReminderWindow(apptDateTime, 24 * 60 * 60 * 1000)) {
        const existing = appt.reminders.find(r => r.type === ReminderType.REMINDER_24H);
        if (!existing?.sent) {
          const message = build24hMessage(patientName, doctorName, clinicName, dateLabel, appt.appointmentTime);
          const channel = await dispatchReminder({
            appointmentId: appt.id,
            type: ReminderType.REMINDER_24H,
            phone,
            clinicId: appt.clinicId,
            sessionBody: message,
            templateData,
            existingReminderId: existing?.id
          });
          if (channel !== 'skipped') {
            console.info(`[ReminderService] Sent 24h reminder via ${channel} → appointment ${appt.id} (${patientName})`);
          }
        }
      }

      // 1-hour reminder
      if (isInReminderWindow(apptDateTime, 1 * 60 * 60 * 1000)) {
        const existing = appt.reminders.find(r => r.type === ReminderType.REMINDER_1H);
        if (!existing?.sent) {
          const message = build1hMessage(patientName, doctorName, clinicName, dateLabel, appt.appointmentTime);
          const channel = await dispatchReminder({
            appointmentId: appt.id,
            type: ReminderType.REMINDER_1H,
            phone,
            clinicId: appt.clinicId,
            sessionBody: message,
            templateData,
            existingReminderId: existing?.id
          });
          if (channel !== 'skipped') {
            console.info(`[ReminderService] Sent 1h reminder via ${channel} → appointment ${appt.id} (${patientName})`);
          }
        }
      }
    } catch (error) {
      console.error(`[ReminderService] Failed to process appointment ${appt.id}:`, error);
    }
  }
};
