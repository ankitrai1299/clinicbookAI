import cron from 'node-cron';

import { withCronLock } from './cronLock.js';

import { processAutoCompleteVisits } from '../services/autoCompleteVisits.service.js';

// Every 5 minutes — soon after a slot ends, if the doctor used the scribe, the
// visit auto-completes and the patient gets their thank-you + prescription.
const CRON_EXPRESSION = '*/5 * * * *';

// Only ONE instance runs each tick. The lease is generous (the job releases it
// as soon as it finishes) so a process dying mid-run pauses the job for at most
// this long instead of wedging it forever.
const LOCK_NAME = 'auto-complete-visits';
const LEASE_MS = 10 * 60_000;

// On by default; set AUTO_COMPLETE_VISITS_ENABLED=false to turn off.
const enabled = process.env.AUTO_COMPLETE_VISITS_ENABLED !== 'false';

export const startAutoCompleteVisitsCron = (): void => {
  if (!enabled) {
    console.info('[AutoCompleteCron] DISABLED (AUTO_COMPLETE_VISITS_ENABLED=false).');
    return;
  }
  cron.schedule(CRON_EXPRESSION, () => {
    void withCronLock(LOCK_NAME, LEASE_MS, processAutoCompleteVisits).catch((error: unknown) => {
      console.error('[AutoCompleteCron] Unhandled error:', error);
    });
  });
  console.info('[AutoCompleteCron] Auto-complete-visits cron scheduled (every 5 minutes)');
};
