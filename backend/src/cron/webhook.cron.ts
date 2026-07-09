import cron from 'node-cron';

import { processWebhookDeliveries } from '../core/webhooks/webhookDelivery.service.js';

// Every minute: the outbox is written synchronously by the event handler, so this
// is only about how fast a partner hears about it. The first retry backoff is a
// minute too, so a tighter schedule would just poll an empty table.
const CRON_EXPRESSION = '* * * * *';

// On by default (the table is empty until a clinic registers an endpoint, so the
// cost is one indexed query per minute). WEBHOOKS_ENABLED=false turns it off.
const webhooksEnabled = process.env.WEBHOOKS_ENABLED !== 'false';

export const startWebhookCron = (): void => {
  if (!webhooksEnabled) {
    console.info('[WebhookCron] DISABLED (WEBHOOKS_ENABLED=false).');
    return;
  }

  cron.schedule(CRON_EXPRESSION, () => {
    processWebhookDeliveries().catch((error: unknown) => {
      console.error('[WebhookCron] Unhandled error draining webhook outbox:', error);
    });
  });

  console.info('[WebhookCron] Webhook delivery cron scheduled (every minute)');
};
