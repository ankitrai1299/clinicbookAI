// Shared Sarvam AI integration helpers.
//
// One place that knows the Sarvam API key, base URL and the quirks of Sarvam's
// OpenAI-compatible chat endpoint (a reasoning model with a per-tier max_tokens
// cap). Used by the transcript translation and clinical-report services. The
// speech-to-text service has its own module (sarvamStt.ts) because the STT flow
// (sync + batch) is substantial on its own.
//
// The API key is read from the environment (SARVAM_API_KEY) and NEVER logged.

// Sarvam key from the environment. Trimmed defensively — a stray space/newline
// in the .env value produces a 401/403 from Sarvam.
export function sarvamKey(): string {
  return (process.env.SARVAM_API_KEY || '').trim();
}

// API origin. Derived from SARVAM_API_URL (the STT endpoint the user configured)
// so a single env var pins the host; falls back to the public Sarvam host.
export function sarvamOrigin(): string {
  const configured = (process.env.SARVAM_API_URL || '').trim();
  try {
    if (configured) return new URL(configured).origin;
  } catch {
    /* malformed URL — fall through to the default */
  }
  return 'https://api.sarvam.ai';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SarvamChatOptions {
  // Chat model. sarvam-30b is the default; sarvam-105b is also available.
  model?: string;
  // Upper bound on generated tokens. Sarvam's starter tier caps this at 4096,
  // and the reasoning trace shares this budget, so we default just under the cap.
  maxTokens?: number;
  // Force a JSON object response (used by report generation).
  jsonMode?: boolean;
  // Reasoning depth. Sarvam models always reason; 'low' minimises the overhead.
  reasoningEffort?: 'low' | 'medium' | 'high';
  // Ask the model to skip its "thinking" phase. Roughly halves the reasoning
  // tokens, freeing the shared budget for the actual answer — used by
  // translation, where reasoning adds no value and only risks exhausting the cap.
  disableThinking?: boolean;
}

// Hard ceiling accepted by Sarvam's chat models on the current subscription tier.
const MAX_TOKENS_CAP = 4096;

/**
 * Call Sarvam's OpenAI-compatible chat completion endpoint and return the
 * assistant's text. Throws a clear Error on transport/API failure or when the
 * model produced no usable content (e.g. the reasoning trace exhausted the
 * token budget before any answer was emitted).
 */
export async function sarvamChat(messages: ChatMessage[], opts: SarvamChatOptions = {}): Promise<string> {
  const key = sarvamKey();
  if (!key) {
    throw new Error('SARVAM_API_KEY is not configured. Add it to your .env file.');
  }

  const model = opts.model || 'sarvam-30b';
  const maxTokens = Math.min(opts.maxTokens || 4000, MAX_TOKENS_CAP);
  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    reasoning_effort: opts.reasoningEffort || 'low',
    max_tokens: maxTokens,
    messages,
  };
  if (opts.jsonMode) body.response_format = { type: 'json_object' };
  // enable_thinking:false tells Sarvam to skip most of its reasoning trace so the
  // token budget goes to the answer instead of being exhausted by "thinking".
  if (opts.disableThinking) body.chat_template_kwargs = { enable_thinking: false };

  console.log(
    '[sarvam:chat] request — model:', model,
    '| jsonMode:', !!opts.jsonMode,
    '| maxTokens:', maxTokens,
    '| thinking:', opts.disableThinking ? 'off' : 'on',
  );

  let res: Response;
  try {
    res = await fetch(`${sarvamOrigin()}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    console.error('[sarvam:chat] network error:', err?.message || err);
    throw new Error('Could not reach the Sarvam API. Please check the connection and try again.');
  }

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.parse(text)?.error?.message || text;
    } catch {
      /* non-JSON error body */
    }
    console.error('[sarvam:chat] API error:', res.status, detail);
    const err: any = new Error(`Sarvam chat failed: ${detail}`);
    err.status = res.status;
    throw err;
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Sarvam chat returned an unexpected (non-JSON) response.');
  }

  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  // Log the finish reason and token usage so budget issues are diagnosable.
  console.log(
    '[sarvam:chat] response — finish:', choice?.finish_reason,
    '| chars:', (content || '').length,
    '| usage:', JSON.stringify(data?.usage || {}),
  );

  if (content == null || content === '') {
    // finish_reason 'length' with empty content = the reasoning trace consumed
    // the whole token budget before the answer. Flag it so callers (translation)
    // can react by splitting the input into smaller pieces and retrying.
    const err: any = new Error('Sarvam chat produced no content (token budget exhausted).');
    err.emptyContent = true;
    throw err;
  }
  return content;
}
