import cron from 'node-cron';

import { processReminders } from '../services/reminder.service.js';

// Runs every 10 minutes — window size in reminder.service.ts matches this interval
const CRON_EXPRESSION = '*/10 * * * *';

// Reminders are OFF by default. The reminder time math treats the stored
// "HH:MM AM/PM" as UTC, but appointment times are clinic-local (IST), so
// reminders fire ~5.5h off and patients got a wrong "your appointment is in
// 1 hour" message. Until appointment times are timezone-aware, keep this
// disabled. Re-enable by setting REMINDERS_ENABLED=true once that is fixed.
const remindersEnabled = process.env.REMINDERS_ENABLED === 'true';

export const startReminderCron = (): void => {
  if (!remindersEnabled) {
    console.info('[ReminderCron] DISABLED (set REMINDERS_ENABLED=true to enable once times are timezone-aware).');
    return;
  }

  cron.schedule(CRON_EXPRESSION, () => {
    console.info('[ReminderCron] Checking upcoming appointments for reminders...');
    processReminders().catch((error: unknown) => {
      console.error('[ReminderCron] Unhandled error during reminder processing:', error);
    });
  });

  console.info('[ReminderCron] Reminder cron job scheduled (every 10 minutes)');
};
