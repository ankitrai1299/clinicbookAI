// Generic, product-agnostic LLM helper. The shared AI primitive that any product
// (NovaScribe, PatientLoop, …) calls for a one-shot completion, without pulling
// in ai.service.ts (which is ClinicBook's patient-chat / tool-calling agent).
//
// Keep this thin: a single completion call. Product-specific prompts and parsing
// live in the product module, not here.

import OpenAI from 'openai';

import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

// Same default model the rest of the codebase uses.
const DEFAULT_MODEL = 'gpt-4.1-mini';

const getClient = (): OpenAI => {
  if (!env.OPENAI_API_KEY) {
    throw new AppError('AI is not configured. Add OPENAI_API_KEY to backend/.env', 503);
  }
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
};

/** True when an OpenAI key is present, so callers can degrade gracefully. */
export const isAiConfigured = (): boolean => Boolean(env.OPENAI_API_KEY);

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
  model = DEFAULT_MODEL,
  temperature = 0.2,
  json = false
}: CompleteOptions): Promise<string> => {
  const client = getClient();

  const res = await client.chat.completions.create({
    model,
    temperature,
    ...(json ? { response_format: { type: 'json_object' as const } } : {}),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  return res.choices[0]?.message?.content?.trim() ?? (json ? '{}' : '');
};
