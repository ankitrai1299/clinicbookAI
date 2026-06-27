// Transactional email via Resend. Single platform-level integration (set once
// with RESEND_API_KEY + EMAIL_FROM). When no key is configured the message is
// logged to the server console instead of sent — so local dev and tests work
// without a provider, and a missing key never breaks signup.

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
    console.info(`[email] (no RESEND_API_KEY) would send to ${to}: ${subject}\n${text}`);
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
