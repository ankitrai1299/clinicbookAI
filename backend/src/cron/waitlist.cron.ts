import cron from 'node-cron';

import { expireStaleOffers } from '../modules/waitlist/waitlist.service.js';

// Runs every minute: any waitlist slot offer whose 15-minute hold has elapsed is
// dropped and the slot is rolled to the next waiting patient. Always on (the
// waitlist auto-offer is core); set WAITLIST_CRON_ENABLED=false to disable.
const CRON_EXPRESSION = '* * * * *';
const enabled = process.env.WAITLIST_CRON_ENABLED !== 'false';

export const startWaitlistCron = (): void => {
  if (!enabled) {
    console.info('[WaitlistCron] DISABLED (WAITLIST_CRON_ENABLED=false).');
    return;
  }

  cron.schedule(CRON_EXPRESSION, () => {
    expireStaleOffers()
      .then((n) => {
        if (n > 0) console.info(`[WaitlistCron] Rolled ${n} expired offer(s) to the next patient.`);
      })
      .catch((error: unknown) => {
        console.error('[WaitlistCron] Unhandled error during offer expiry sweep:', error);
      });
  });

  console.info('[WaitlistCron] Waitlist hold-expiry sweep scheduled (every minute).');
};
