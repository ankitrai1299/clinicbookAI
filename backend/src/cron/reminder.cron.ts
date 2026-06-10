import cron from 'node-cron';

import { processReminders } from '../services/reminder.service.js';

// Runs every 10 minutes — window size in reminder.service.ts matches this interval
const CRON_EXPRESSION = '*/10 * * * *';

export const startReminderCron = (): void => {
  cron.schedule(CRON_EXPRESSION, () => {
    console.info('[ReminderCron] Checking upcoming appointments for reminders...');
    processReminders().catch((error: unknown) => {
      console.error('[ReminderCron] Unhandled error during reminder processing:', error);
    });
  });

  console.info('[ReminderCron] Reminder cron job scheduled (every 10 minutes)');
};
