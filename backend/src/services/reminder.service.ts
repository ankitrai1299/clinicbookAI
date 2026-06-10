import { AppointmentStatus, ReminderType } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { sendWhatsAppTextMessage } from '../modules/whatsapp/whatsapp.service.js';

// Appointment datetime is constructed from appointmentDate (UTC midnight) + appointmentTime string ("HH:MM")
const getAppointmentDateTime = (date: Date, timeStr: string): Date => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dt = new Date(date);
  dt.setUTCHours(hours, minutes ?? 0, 0, 0);
  return dt;
};

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
  `Hello ${patientName}!\n\nThis is a reminder that you have an appointment tomorrow.\n\nDate: ${dateLabel}\nTime: ${time}\nDoctor: Dr. ${doctorName}\nClinic: ${clinicName}\n\nPlease arrive 10 minutes early. Contact us if you need to reschedule.`;

const build2hMessage = (
  patientName: string,
  doctorName: string,
  clinicName: string,
  dateLabel: string,
  time: string
): string =>
  `Hello ${patientName}!\n\nYour appointment is in 2 hours.\n\nDate: ${dateLabel}\nTime: ${time}\nDoctor: Dr. ${doctorName}\nClinic: ${clinicName}\n\nSee you soon!`;

const dispatchReminder = async (
  appointmentId: string,
  type: ReminderType,
  phone: string,
  message: string,
  existingReminderId: string | undefined
): Promise<void> => {
  await sendWhatsAppTextMessage({ to: phone, body: message });

  if (existingReminderId) {
    await prisma.reminder.update({
      where: { id: existingReminderId },
      data: { sent: true }
    });
  } else {
    await prisma.reminder.create({
      data: { appointmentId, type, sent: true }
    });
  }
};

export const processReminders = async (): Promise<void> => {
  const now = new Date();

  // Fetch today + tomorrow so we can cover 24h and 2h windows without timezone edge cases
  const todayUtcMidnight = new Date(now);
  todayUtcMidnight.setUTCHours(0, 0, 0, 0);

  const dayAfterTomorrowUtcMidnight = new Date(todayUtcMidnight);
  dayAfterTomorrowUtcMidnight.setUTCDate(dayAfterTomorrowUtcMidnight.getUTCDate() + 2);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
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
      const apptDateTime = getAppointmentDateTime(appt.appointmentDate, appt.appointmentTime);
      const dateLabel = appt.appointmentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC'
      });

      const { name: patientName, phone } = appt.patient;
      const { name: doctorName } = appt.doctor;
      const { name: clinicName } = appt.clinic;

      // 24-hour reminder
      if (isInReminderWindow(apptDateTime, 24 * 60 * 60 * 1000)) {
        const existing = appt.reminders.find(r => r.type === ReminderType.REMINDER_24H);
        if (!existing?.sent) {
          const message = build24hMessage(patientName, doctorName, clinicName, dateLabel, appt.appointmentTime);
          await dispatchReminder(appt.id, ReminderType.REMINDER_24H, phone, message, existing?.id);
          console.info(`[ReminderService] Sent 24h reminder → appointment ${appt.id} (${patientName})`);
        }
      }

      // 2-hour reminder
      if (isInReminderWindow(apptDateTime, 2 * 60 * 60 * 1000)) {
        const existing = appt.reminders.find(r => r.type === ReminderType.REMINDER_2H);
        if (!existing?.sent) {
          const message = build2hMessage(patientName, doctorName, clinicName, dateLabel, appt.appointmentTime);
          await dispatchReminder(appt.id, ReminderType.REMINDER_2H, phone, message, existing?.id);
          console.info(`[ReminderService] Sent 2h reminder → appointment ${appt.id} (${patientName})`);
        }
      }
    } catch (error) {
      console.error(`[ReminderService] Failed to process appointment ${appt.id}:`, error);
    }
  }
};
