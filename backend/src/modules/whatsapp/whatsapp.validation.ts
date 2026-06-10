import { z } from 'zod';

export const sendWhatsAppTextSchema = z.object({
  to: z.string().trim().min(6).max(30),
  body: z.string().trim().min(1).max(4096),
  previewUrl: z.boolean().optional()
});

export type SendWhatsAppTextInput = z.infer<typeof sendWhatsAppTextSchema>;