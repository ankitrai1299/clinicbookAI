// Generic, product-agnostic LLM helper. The shared AI primitive that any product
// (NovaScribe, PatientLoop, …) calls for a one-shot completion, without pulling
// in ai.service.ts (which is ClinicBook's patient-chat / tool-calling agent).
//
// Keep this thin: a single completion call. Product-specific prompts and parsing
// live in the product module, not here.

import { aiClient, aiExtras, aiModel, isAiConfigured } from './provider.js';

/** True when the configured provider is usable, so callers can degrade gracefully. */
export { isAiConfigured };

export interface CompleteOptions {
  /** System prompt: role + output contract. */
  system: string;
  /** User content (the actual input — e.g. a transcript). */
  user: string;
  model?: string;
  temperature?: number;
  /** Force a JSON object response (OpenAI json_object mode). */
  json?: boolean;
}

/**
 * One-shot chat completion. Returns the assistant's text (or `{}` if the model
 * returned nothing in JSON mode). Throws AppError(503) when AI is unconfigured.
 */
export const complete = async ({
  system,
  user,
  model,
  temperature = 0.2,
  json = false
}: CompleteOptions): Promise<string> => {
  const client = aiClient();

  const res = await client.chat.completions.create({
    model: model || aiModel(),
    temperature,
    ...aiExtras(),
    ...(json ? { response_format: { type: 'json_object' as const } } : {}),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  return res.choices[0]?.message?.content?.trim() ?? (json ? '{}' : '');
};
