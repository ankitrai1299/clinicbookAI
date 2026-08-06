import cron from 'node-cron';

import { withCronLock } from './cronLock.js';

import { processWebhookDeliveries } from '../core/webhooks/webhookDelivery.service.js';

// Every minute: the outbox is written synchronously by the event handler, so this
// is only about how fast a partner hears about it. The first retry backoff is a
// minute too, so a tighter schedule would just poll an empty table.
const CRON_EXPRESSION = '* * * * *';

// Only ONE instance runs each tick. The lease is generous (the job releases it
// as soon as it finishes) so a process dying mid-run pauses the job for at most
// this long instead of wedging it forever.
const LOCK_NAME = 'webhook-outbox';
const LEASE_MS = 5 * 60_000;

// On by default (the table is empty until a clinic registers an endpoint, so the
// cost is one indexed query per minute). WEBHOOKS_ENABLED=false turns it off.
const webhooksEnabled = process.env.WEBHOOKS_ENABLED !== 'false';

export const startWebhookCron = (): void => {
  if (!webhooksEnabled) {
    console.info('[WebhookCron] DISABLED (WEBHOOKS_ENABLED=false).');
    return;
  }

  cron.schedule(CRON_EXPRESSION, () => {
    void withCronLock(LOCK_NAME, LEASE_MS, processWebhookDeliveries).catch((error: unknown) => {
      console.error('[WebhookCron] Unhandled error draining webhook outbox:', error);
    });
  });

  console.info('[WebhookCron] Webhook delivery cron scheduled (every minute)');
};
