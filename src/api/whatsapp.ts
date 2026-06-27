import { apiFetch } from './client';

// Public (non-secret) Meta config the Embedded Signup popup needs.
export interface EmbeddedConfig {
  configured: boolean;
  appId?: string;
  configId?: string;
  graphVersion: string;
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
  status: string;
  tokenEncrypted: boolean;
  updatedAt: string;
}

export interface ChannelStatus {
  channel: WhatsAppChannel | null;
  healthy: boolean | null; // false → token expired → reconnect
}

export interface EmbeddedSignupResult {
  channel: WhatsAppChannel;
  verification: { displayPhoneNumber?: string; verifiedName?: string };
  webhook: { subscribed: boolean; detail: string };
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
