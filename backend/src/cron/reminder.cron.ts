import cron from 'node-cron';

import { withCronLock } from './cronLock.js';

import { processReminders } from '../services/reminder.service.js';

// Runs every 10 minutes — window size in reminder.service.ts matches this interval
const CRON_EXPRESSION = '*/10 * * * *';

// Only ONE instance runs each tick. The lease is generous (the job releases it
// as soon as it finishes) so a process dying mid-run pauses the job for at most
// this long instead of wedging it forever.
const LOCK_NAME = 'reminders';
const LEASE_MS = 15 * 60_000;

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
    void withCronLock(LOCK_NAME, LEASE_MS, async () => {
      console.info('[ReminderCron] Checking upcoming appointments for reminders...');
      await processReminders();
    }).catch((error: unknown) => {
      console.error('[ReminderCron] Unhandled error during reminder processing:', error);
    });
  });

  console.info('[ReminderCron] Reminder cron job scheduled (every 10 minutes)');
};
