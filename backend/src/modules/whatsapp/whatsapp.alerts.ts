import { NotificationType } from '@prisma/client';

import { env } from '../../config/env.js';
import { recordNotification } from '../notifications/notification.service.js';

// Raises an admin-facing alert when outbound WhatsApp sending is repeatedly
// failing, so staff find out that patients aren't getting replies BEFORE a
// patient complains. Two triggers:
//   - an expired/invalid access token (critical — every message fails) → alert
//     immediately, since nothing will send until the token is replaced;
//   - a sustained outage (a run of consecutive terminal failures) → alert once
//     when the streak crosses a threshold, without spamming one per message.

export const FAILURE_ALERT_THRESHOLD = 3;

let consecutiveFailures = 0;
let alertedForCurrentStreak = false;

export interface AdminAlert {
  clinicId: string;
  title: string;
  body: string;
  critical: boolean;
}

export type AlertSink = (alert: AdminAlert) => void;

// Default sink: log loudly (always works, even before the SYSTEM_ALERT enum is
// migrated) AND drop a dashboard notification for the clinic admins.
const defaultSink: AlertSink = (alert) => {
  console.error(
    `[WhatsApp][ADMIN ALERT]${alert.critical ? ' CRITICAL' : ''} ${alert.title} — ${alert.body}`
  );
  if (alert.clinicId) {
    recordNotification({
      clinicId: alert.clinicId,
      type: NotificationType.SYSTEM_ALERT,
      title: alert.title,
      body: alert.body
    });
  }
};

let sink: AlertSink = defaultSink;

const resolveClinicId = (clinicId?: string | null): string => clinicId ?? env.WHATSAPP_CLINIC_ID ?? '';

// A successful send clears the failure streak.
export const noteSendSuccess = (): void => {
  consecutiveFailures = 0;
  alertedForCurrentStreak = false;
};

// Records a terminal send failure (after retries) and raises an admin alert when
// warranted. Call exactly once per message that ultimately failed.
export const noteSendFailure = (params: {
  clinicId?: string | null;
  tokenExpired: boolean;
  error: string;
}): void => {
  consecutiveFailures += 1;

  if (params.tokenExpired) {
    sink({
      clinicId: resolveClinicId(params.clinicId),
      title: 'WhatsApp access token expired',
      body:
        'Outbound WhatsApp messages are failing because the access token is expired or invalid. ' +
        'Patients are NOT receiving replies. Replace WHATSAPP_TOKEN with a valid permanent token.',
      critical: true
    });
    return;
  }

  if (consecutiveFailures >= FAILURE_ALERT_THRESHOLD && !alertedForCurrentStreak) {
    alertedForCurrentStreak = true;
    sink({
      clinicId: resolveClinicId(params.clinicId),
      title: 'WhatsApp sending is failing',
      body:
        `${consecutiveFailures} consecutive outbound WhatsApp messages have failed. ` +
        `Patients may not be receiving replies. Latest error: ${params.error}`,
      critical: false
    });
  }
};

// --- Test seams (not used in production) ----------------------------------
export const __setAlertSinkForTest = (s: AlertSink | null): void => {
  sink = s ?? defaultSink;
};
export const __resetAlertStateForTest = (): void => {
  consecutiveFailures = 0;
  alertedForCurrentStreak = false;
};
export const __getConsecutiveFailuresForTest = (): number => consecutiveFailures;
