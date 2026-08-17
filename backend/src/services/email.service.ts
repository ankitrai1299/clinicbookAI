// Transactional email via Resend. Single platform-level integration (set once
// with RESEND_API_KEY + EMAIL_FROM). When no key is configured the message is
// logged to the server console instead of sent — so local dev and tests work
// without a provider, and a missing key never breaks signup.

import { maskEmail } from '../core/observability/redact.js';
import { Resend } from 'resend';

import { env } from '../config/env.js';

const client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export const isEmailConfigured = (): boolean => Boolean(env.RESEND_API_KEY);

// Startup diagnostic so the active email config is visible in the deploy logs —
// makes it obvious when EMAIL_FROM still points at the Resend test domain (which
// only delivers to the account owner) vs a verified production domain.
export const logEmailStartupInfo = (): void => {
  if (!env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — OTP codes are LOGGED to console, not emailed (dev mode).');
    return;
  }
  console.info(`[email] Resend configured. Sender (EMAIL_FROM): ${env.EMAIL_FROM}`);
  if (/@resend\.dev/i.test(env.EMAIL_FROM)) {
    console.warn(
      '[email] EMAIL_FROM uses the Resend test domain (@resend.dev) — emails deliver ONLY to your Resend account address. ' +
        'Set EMAIL_FROM to a verified custom domain (e.g. "ClinicBook AI <noreply@clinicbook.ai>") for delivery to any clinic owner.'
    );
  }
};

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const send = async ({ to, subject, html, text }: SendArgs): Promise<void> => {
  if (!client) {
    // Dev / unconfigured: surface the content so the flow is testable locally.
    // Dev-only path, but it ran with a real address and a real body — including
    // the signup OTP, which is a credential.
    console.info(`[email] (no RESEND_API_KEY) would send to ${maskEmail(to)}: ${subject}`);
    return;
  }
  const { error } = await client.emails.send({ from: env.EMAIL_FROM, to, subject, html, text });
  if (error) {
    // Surface a clean message; the caller decides how to react.
    throw new Error(`Email send failed: ${error.message ?? 'unknown Resend error'}`);
  }
};

// The signup verification code email.
export const sendOtpEmail = async (to: string, code: string): Promise<void> => {
  const subject = 'Your ClinicBook AI verification code';
  const text = `Your ClinicBook AI verification code is ${code}. It expires in 10 minutes.`;
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#0f172a">Verify your email</h2>
      <p style="color:#475569">Enter this code to finish setting up your ClinicBook AI account:</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#0284c7;margin:20px 0">${code}</div>
      <p style="color:#94a3b8;font-size:13px">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
    </div>`;
  await send({ to, subject, html, text });
};

/**
 * A security alert to whoever is on call.
 *
 * Deliberately thin: severity, what fired, one sentence, and the alert id. No
 * patient data, no clinical text, no message bodies — the recipient's inbox is
 * not a place to put a medical record, and the alert id is enough to open the
 * full picture in the audit trail.
 *
 * The SUBJECT LINE carries the severity, because the person reading it on a
 * phone at 11pm decides whether to get up from that line alone.
 */
export const sendSecurityAlertEmail = async (
  to: string,
  alert: {
    severity: string;
    rule: string;
    summary: string;
    subject: string;
    windowStart: Date;
    windowEnd: Date;
    alertId: string;
  }
): Promise<void> => {
  const subject = `[${alert.severity.toUpperCase()}] ClinicBook security alert: ${alert.rule}`;
  const when = `${alert.windowStart.toISOString()} → ${alert.windowEnd.toISOString()}`;
  const text =
    `${alert.summary}\n\n` +
    `Rule: ${alert.rule}\nSeverity: ${alert.severity}\nSubject: ${alert.subject}\nWindow: ${when}\n` +
    `Alert id: ${alert.alertId}\n\n` +
    `If this is real, the CERT-In clock started when you read this: an incident must be ` +
    `reported within 6 HOURS of being noticed. See docs/compliance/INCIDENT_RESPONSE.md.`;

  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#0f172a;margin-bottom:4px">Security alert</h2>
      <p style="color:#334155;font-size:15px">${alert.summary}</p>
      <table style="font-size:13px;color:#475569;border-collapse:collapse">
        <tr><td style="padding:2px 12px 2px 0"><b>Rule</b></td><td>${alert.rule}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><b>Severity</b></td><td>${alert.severity}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><b>Subject</b></td><td>${alert.subject}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><b>Window</b></td><td>${when}</td></tr>
        <tr><td style="padding:2px 12px 2px 0"><b>Alert id</b></td><td>${alert.alertId}</td></tr>
      </table>
      <p style="color:#b91c1c;font-size:13px;margin-top:16px">
        If this is real, the CERT-In clock started when you read this: an incident must be reported
        within <b>6 hours</b> of being noticed. Follow docs/compliance/INCIDENT_RESPONSE.md.
      </p>
    </div>
  `;

  await send({ to, subject, html, text });
};
