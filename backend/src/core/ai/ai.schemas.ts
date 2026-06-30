import { z } from 'zod';

// Caps the staff AI chat input. A length bound limits per-request token cost and
// prevents oversized prompts from driving expensive model calls.
export const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().trim().min(1).optional()
});

export type ChatInput = z.infer<typeof chatSchema>;
