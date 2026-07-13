import cron from 'node-cron';

import { processAutoCompleteVisits } from '../services/autoCompleteVisits.service.js';

// Every 5 minutes — soon after a slot ends, if the doctor used the scribe, the
// visit auto-completes and the patient gets their thank-you + prescription.
const CRON_EXPRESSION = '*/5 * * * *';

// On by default; set AUTO_COMPLETE_VISITS_ENABLED=false to turn off.
const enabled = process.env.AUTO_COMPLETE_VISITS_ENABLED !== 'false';

export const startAutoCompleteVisitsCron = (): void => {
  if (!enabled) {
    console.info('[AutoCompleteCron] DISABLED (AUTO_COMPLETE_VISITS_ENABLED=false).');
    return;
  }
  cron.schedule(CRON_EXPRESSION, () => {
    processAutoCompleteVisits().catch((error: unknown) => {
      console.error('[AutoCompleteCron] Unhandled error:', error);
    });
  });
  console.info('[AutoCompleteCron] Auto-complete-visits cron scheduled (every 5 minutes)');
};
