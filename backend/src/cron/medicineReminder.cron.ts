import cron from 'node-cron';

import { withCronLock } from './cronLock.js';

import { processMedicineReminders } from '../services/medicineReminder.service.js';

// Every 10 minutes — matches the claim window in the service so a reminder due at
// its scheduled minute is picked up within one interval.
const CRON_EXPRESSION = '*/10 * * * *';

// Only ONE instance runs each tick. The lease is generous (the job releases it
// as soon as it finishes) so a process dying mid-run pauses the job for at most
// this long instead of wedging it forever.
const LOCK_NAME = 'medicine-reminders';
const LEASE_MS = 15 * 60_000;

// On by default; set MEDICINE_REMINDERS_ENABLED=false to turn off.
const enabled = process.env.MEDICINE_REMINDERS_ENABLED !== 'false';

export const startMedicineReminderCron = (): void => {
  if (!enabled) {
    console.info('[MedicineReminderCron] DISABLED (MEDICINE_REMINDERS_ENABLED=false).');
    return;
  }
  cron.schedule(CRON_EXPRESSION, () => {
    void withCronLock(LOCK_NAME, LEASE_MS, processMedicineReminders).catch((error: unknown) => {
      console.error('[MedicineReminderCron] Unhandled error:', error);
    });
  });
  console.info('[MedicineReminderCron] Medicine reminder cron scheduled (every 10 minutes)');
};
