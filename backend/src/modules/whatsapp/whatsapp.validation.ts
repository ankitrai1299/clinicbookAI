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