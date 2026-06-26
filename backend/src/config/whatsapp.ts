import axios, { AxiosInstance } from 'axios';

import { env } from './env.js';

const ensureWhatsAppConfig = () => {
  if (!env.WHATSAPP_TOKEN || !env.PHONE_NUMBER_ID) {
    throw new Error('WhatsApp configuration is missing. Set WHATSAPP_TOKEN and PHONE_NUMBER_ID.');
  }
};

// Build a Graph API client for an ARBITRARY access token. Used by the per-clinic
// channel layer so each clinic sends from its own WhatsApp number/token.
export const buildWhatsAppClient = (accessToken: string): AxiosInstance =>
  axios.create({
    baseURL: 'https://graph.facebook.com/v20.0',
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

// The env "default channel" client (the original single-clinic number). Retained
// as the fallback when a clinic has no WhatsAppChannel row.
export const getWhatsAppApiClient = (): AxiosInstance => {
  ensureWhatsAppConfig();
  return buildWhatsAppClient(env.WHATSAPP_TOKEN as string);
};

export const getWhatsAppWebhookVerifyToken = () => env.VERIFY_TOKEN ?? '';

export const getWhatsAppPhoneNumberId = () => {
  ensureWhatsAppConfig();
  return env.PHONE_NUMBER_ID as string;
};

export const isWhatsAppConfigured = () => Boolean(env.WHATSAPP_TOKEN && env.PHONE_NUMBER_ID && env.VERIFY_TOKEN);