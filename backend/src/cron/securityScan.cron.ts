import cron from 'node-cron';

import { withCronLock } from './cronLock.js';
import { scanForIncidents, WINDOW_MINUTES } from '../core/security/detector.js';

// Watch the audit trail for the patterns in core/security/rules.ts.
//
// Every 10 minutes against a 15-minute window: the windows OVERLAP on purpose,
// so a burst straddling a boundary is still seen whole and a late or skipped
// tick loses nothing. The dedupe key is what stops the overlap producing
// duplicate alerts.
//
// Ten minutes is also the honest granularity for the six-hour CERT-In clock.
// Sub-minute detection would need a stream, and would buy nothing against a
// deadline measured in hours.
const CRON_EXPRESSION = '*/10 * * * *';

const LOCK_NAME = 'security-scan';
const LEASE_MS = 9 * 60_000;

// ON by default. Turning detection off is a decision someone should have to
// make explicitly, not one they get by forgetting a variable.
const enabled = process.env.SECURITY_SCAN_ENABLED !== 'false';

export const startSecurityScanCron = (): void => {
  if (!enabled) {
    console.warn('[SecurityScan] DISABLED (SECURITY_SCAN_ENABLED=false). Nothing is watching the audit trail.');
    return;
  }

  cron.schedule(CRON_EXPRESSION, () => {
    void withCronLock(LOCK_NAME, LEASE_MS, async () => {
      const result = await scanForIncidents();
      // Only speak up when there is something to say — a scanner that logs
      // "nothing found" every ten minutes buries the run that did find something.
      if (result.raised > 0) {
        console.error(
          `[SecurityScan] ${result.raised} new alert(s) from ${result.scanned} audit rows; ${result.notified} emailed.`
        );
      }
    }).catch((error: unknown) => {
      console.error('[SecurityScan] Unhandled error during the scan:', error);
    });
  });

  console.info(
    `[SecurityScan] Watching the audit trail every 10 minutes (${WINDOW_MINUTES}-minute window).` +
      (process.env.SECURITY_ALERT_EMAIL ? '' : ' No SECURITY_ALERT_EMAIL set — alerts are recorded and logged, not emailed.')
  );
};
