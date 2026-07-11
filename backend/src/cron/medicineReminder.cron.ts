import cron from 'node-cron';

import { processMedicineReminders } from '../services/medicineReminder.service.js';

// Every 10 minutes — matches the claim window in the service so a reminder due at
// its scheduled minute is picked up within one interval.
const CRON_EXPRESSION = '*/10 * * * *';

// On by default; set MEDICINE_REMINDERS_ENABLED=false to turn off.
const enabled = process.env.MEDICINE_REMINDERS_ENABLED !== 'false';

export const startMedicineReminderCron = (): void => {
  if (!enabled) {
    console.info('[MedicineReminderCron] DISABLED (MEDICINE_REMINDERS_ENABLED=false).');
    return;
  }
  cron.schedule(CRON_EXPRESSION, () => {
    processMedicineReminders().catch((error: unknown) => {
      console.error('[MedicineReminderCron] Unhandled error:', error);
    });
  });
  console.info('[MedicineReminderCron] Medicine reminder cron scheduled (every 10 minutes)');
};
