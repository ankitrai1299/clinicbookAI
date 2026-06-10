import axios, { AxiosInstance } from 'axios';

import { env } from './env.js';

const ensureWhatsAppConfig = () => {
  if (!env.WHATSAPP_TOKEN || !env.PHONE_NUMBER_ID) {
    throw new Error('WhatsApp configuration is missing. Set WHATSAPP_TOKEN and PHONE_NUMBER_ID.');
  }
};

export const getWhatsAppApiClient = (): AxiosInstance => {
  ensureWhatsAppConfig();

  return axios.create({
    baseURL: 'https://graph.facebook.com/v20.0',
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
};

export const getWhatsAppWebhookVerifyToken = () => env.VERIFY_TOKEN ?? '';

export const getWhatsAppPhoneNumberId = () => {
  ensureWhatsAppConfig();
  return env.PHONE_NUMBER_ID as string;
};

export const isWhatsAppConfigured = () => Boolean(env.WHATSAPP_TOKEN && env.PHONE_NUMBER_ID && env.VERIFY_TOKEN);