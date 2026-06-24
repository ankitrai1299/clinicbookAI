import cron from 'node-cron';

import { processReminders } from '../services/reminder.service.js';

// Runs every 10 minutes — window size in reminder.service.ts matches this interval
const CRON_EXPRESSION = '*/10 * * * *';

// Reminders are ON by default now that appointment times are timezone-aware:
// reminder timing uses clinicLocalInstant() (IST → true UTC instant), so the
// earlier ~5.5h drift is fixed. Set REMINDERS_ENABLED=false to turn them off.
// Only the 1-hour reminder fires by default; the 24h one is opt-in via
// REMINDER_24H_ENABLED=true (see reminder.service.ts).
const remindersEnabled = process.env.REMINDERS_ENABLED !== 'false';

export const startReminderCron = (): void => {
  if (!remindersEnabled) {
    console.info('[ReminderCron] DISABLED (REMINDERS_ENABLED=false).');
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
