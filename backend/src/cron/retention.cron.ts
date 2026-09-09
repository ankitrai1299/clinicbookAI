import cron from 'node-cron';

import { withCronLock } from './cronLock.js';

import { applyRetentionPolicy } from '../core/retention/retention.service.js';

// Once a night, at a quiet hour. Nothing here is urgent — a row that should
// have gone yesterday going tonight instead costs nobody anything, and running
// against a database that is serving clinics does.
const CRON_EXPRESSION = '0 3 * * *';

const LOCK_NAME = 'retention-sweep';
const LEASE_MS = 30 * 60_000;

// ── OFF unless someone turns it on, and that is deliberate ─────────────────
//
// Every other cron here defaults to on. This one does not, because its first
// run against an existing database deletes everything already past its period —
// potentially years of rows, irreversibly, on the deploy that happened to ship
// it. That is not a decision to make on somebody's behalf while they are
// reading a changelog.
//
// The cost of it being off is that data is kept longer than the policy says,
// which is a compliance gap. The cost of it being on by default is deleted data
// nobody agreed to delete. Only one of those can be undone, so the switch is
// opt-in and the boot log says plainly that it is off.
const enabled = process.env.RETENTION_ENABLED === 'true';

export const startRetentionCron = (): void => {
  if (!enabled) {
    console.info(
      '[Retention] DISABLED — set RETENTION_ENABLED=true to apply the retention policy. ' +
        'Until then operational data is kept indefinitely (see core/retention/retention.policy.ts).'
    );
    return;
  }
  cron.schedule(CRON_EXPRESSION, () => {
    // Wrapped rather than passed directly: the lock expects a job that
    // returns nothing, and the sweep's results are for the log, not the caller.
    void withCronLock(LOCK_NAME, LEASE_MS, async () => {
      await applyRetentionPolicy();
    }).catch((error: unknown) => {
      console.error('[Retention] Unhandled error:', error);
    });
  });
  console.info('[Retention] Retention sweep scheduled (daily, 03:00)');
};
