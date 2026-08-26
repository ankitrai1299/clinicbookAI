import { apiFetch } from './client';

// Public (non-secret) Meta config the Embedded Signup popup needs.
export interface EmbeddedConfig {
  configured: boolean;
  appId?: string;
  configId?: string;
  graphVersion: string;
  // False when WA_CHANNEL_ENC_KEY is unset on the server — this clinic's access
  // token would be stored in plaintext. Worth knowing BEFORE connecting, since
  // a token already stored unencrypted stays that way until they reconnect.
  tokenEncryption?: boolean;
}

// Sanitised channel — NEVER includes the access token. The doctor only ever
// sees the business name + number + status.
export interface WhatsAppChannel {
  id: string;
  clinicId: string;
  phoneNumberId: string;
  wabaId: string | null;
  businessId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: string;
  tokenEncrypted: boolean;
  // Cloud API activation. When false, sends fail with Meta error 133010 — the
  // number is claimed but not yet registered for messaging.
  registered: boolean;
  updatedAt: string;
}

export interface TemplateState {
  name: string;
  language: string;
  status: string; // APPROVED | PENDING | REJECTED | PAUSED | DISABLED | ERROR
  reason: string | null;
}

// Approval progress for THIS clinic's own WhatsApp Business Account. A freshly
// connected number starts with zero approved templates, so nothing can be sent
// outside the 24h reply window until Meta finishes reviewing them.
export interface TemplateReadiness {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  /** Canonical templates never submitted to this WABA (no row at all). */
  missing: number;
  ready: boolean;
  syncedAt: string | null;
  templates: TemplateState[];
}

export interface ChannelStatus {
  channel: WhatsAppChannel | null;
  healthy: boolean | null; // false → token expired → reconnect
  templates: TemplateReadiness | null;
}

export interface RegistrationResult {
  registered: boolean;
  alreadyRegistered: boolean;
  detail: string;
}

export interface EmbeddedSignupResult {
  channel: WhatsAppChannel;
  verification: { displayPhoneNumber?: string; verifiedName?: string };
  webhook: { subscribed: boolean; detail: string };
  registration: RegistrationResult;
  templates: TemplateReadiness;
}

export const getEmbeddedConfig = () =>
  apiFetch<EmbeddedConfig>('/api/whatsapp/embedded-signup/config');

export const getChannelStatus = () => apiFetch<ChannelStatus>('/api/whatsapp/channel');

export const completeEmbeddedSignup = (body: { code: string; phoneNumberId: string; wabaId: string }) =>
  apiFetch<EmbeddedSignupResult>('/api/whatsapp/embedded-signup', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const disconnectWhatsApp = () =>
  apiFetch<{ removed: number }>('/api/whatsapp/channel', { method: 'DELETE' });

// --- Per-clinic provisioning ------------------------------------------------

export const getTemplateReadiness = () =>
  apiFetch<TemplateReadiness>('/api/whatsapp/templates');

/** Re-pull Meta's approval verdicts for this clinic's templates. */
export const syncTemplates = () =>
  apiFetch<TemplateReadiness>('/api/whatsapp/templates/sync', { method: 'POST' });

/** Resubmit any template that is missing or was rejected. */
export const provisionTemplates = () =>
  apiFetch<TemplateReadiness>('/api/whatsapp/templates/provision', { method: 'POST' });

/** Retry Cloud API activation for the connected number. */
export const registerNumber = () =>
  apiFetch<RegistrationResult>('/api/whatsapp/channel/register', { method: 'POST' });
