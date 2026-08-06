import cron from 'node-cron';

import { withCronLock } from './cronLock.js';
import { sweepProcessedMessages } from '../core/whatsapp/whatsapp.dedupe.js';

import { expireStaleOffers } from '../products/clinicbook/waitlist/waitlist.service.js';

// Runs every minute: any waitlist slot offer whose 15-minute hold has elapsed is
// dropped and the slot is rolled to the next waiting patient. Always on (the
// waitlist auto-offer is core); set WAITLIST_CRON_ENABLED=false to disable.
const CRON_EXPRESSION = '* * * * *';

// Only ONE instance runs each tick. The lease is generous (the job releases it
// as soon as it finishes) so a process dying mid-run pauses the job for at most
// this long instead of wedging it forever.
const LOCK_NAME = 'waitlist-offers';
const LEASE_MS = 5 * 60_000;
const enabled = process.env.WAITLIST_CRON_ENABLED !== 'false';

export const startWaitlistCron = (): void => {
  if (!enabled) {
    console.info('[WaitlistCron] DISABLED (WAITLIST_CRON_ENABLED=false).');
    return;
  }

  cron.schedule(CRON_EXPRESSION, () => {
    void withCronLock(LOCK_NAME, LEASE_MS, async () => {
      const n = await expireStaleOffers();
      if (n > 0) console.info(`[WaitlistCron] Rolled ${n} expired offer(s) to the next patient.`);
      // Piggy-backed here rather than on its own schedule: the inbound-dedupe
      // table only needs an occasional trim, and this is the cheapest tick that
      // already holds a lock.
      const swept = await sweepProcessedMessages();
      if (swept > 0) console.info(`[WaitlistCron] Swept ${swept} expired inbound-dedupe row(s).`);
    }).catch((error: unknown) => {
      console.error('[WaitlistCron] Unhandled error during offer expiry sweep:', error);
    });
  });

  console.info('[WaitlistCron] Waitlist hold-expiry sweep scheduled (every minute).');
};
