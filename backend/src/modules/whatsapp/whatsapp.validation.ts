import { z } from 'zod';

export const sendWhatsAppTextSchema = z.object({
  to: z.string().trim().min(6).max(30),
  body: z.string().trim().min(1).max(4096),
  previewUrl: z.boolean().optional()
});

export type SendWhatsAppTextInput = z.infer<typeof sendWhatsAppTextSchema>;

export const sendWhatsAppTemplateSchema = z.object({
  to: z.string().trim().min(6).max(30),
  templateName: z.enum([
    'appointment_reminder',
    'booking_confirmation',
    'waitlist_offer',
    'patient_registration',
    'registration_welcome'
  ]),
  // Ordered {{n}} body variables for the template (see whatsapp.templates.ts).
  params: z.array(z.string().trim().min(1)).max(10).optional(),
  languageCode: z.string().trim().min(2).max(10).optional(),
  // Human-readable rendering stored in WhatsAppLog.body for auditing.
  bodyForLog: z.string().trim().min(1).max(4096).optional()
});

export type SendWhatsAppTemplateInput = z.infer<typeof sendWhatsAppTemplateSchema>;

// Onboard / update a clinic's own WhatsApp Cloud API channel.
export const onboardWhatsAppChannelSchema = z.object({
  // Meta Cloud API phone number id (the inbound webhook routing key).
  phoneNumberId: z.string().trim().min(5).max(40),
  // WhatsApp Business Account id (a.k.a. Business ID / WABA id).
  wabaId: z.string().trim().min(5).max(40),
  // Long-lived access token (stored encrypted at rest when WA_CHANNEL_ENC_KEY set).
  accessToken: z.string().trim().min(20).max(1000),
  // Optional per-channel webhook secrets (fall back to env when omitted).
  appSecret: z.string().trim().min(8).max(200).optional(),
  verifyToken: z.string().trim().min(4).max(200).optional(),
  // Auto-subscribe our app to the WABA's webhooks (default true).
  subscribeWebhook: z.boolean().optional()
});

export type OnboardWhatsAppChannelInput = z.infer<typeof onboardWhatsAppChannelSchema>;