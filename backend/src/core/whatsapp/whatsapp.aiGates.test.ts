import { describe, it, expect, beforeEach, vi } from 'vitest';

const env: Record<string, unknown> = {};
vi.mock('../../config/env.js', () => ({ env: new Proxy({}, { get: (_t, k: string) => env[k] }) }));

const { aiReceptionistEnabled } = await import('./whatsapp.receptionist.js');
const { isAiConfigured, aiProvider } = await import('../ai/provider.js');

// Which provider these features ask for before doing anything.
//
// They were written when OpenAI was the only engine, and the move to Sarvam
// changed the client underneath them without changing the question they asked.
// The result was the worst shape a bug can take: the AI receptionist and
// WhatsApp voice notes switched themselves off, no error was raised, nobody
// decided it, and the engine that would have answered was running fine the
// whole time. These tests exist so that cannot happen again quietly.
describe('what the AI features check before running', () => {
  beforeEach(() => {
    for (const k of Object.keys(env)) delete env[k];
    delete process.env.AI_PROVIDER;
  });

  it('runs on Sarvam alone, with no OpenAI key anywhere', () => {
    process.env.SARVAM_API_KEY = 'sk_sarvam';
    env.WA_AI_RECEPTIONIST = true;
    env.OPENAI_API_KEY = undefined;

    expect(aiProvider()).toBe('sarvam');
    expect(isAiConfigured()).toBe(true);
    expect(aiReceptionistEnabled()).toBe(true);
  });

  it('stays off when the clinic has switched it off, however well configured', () => {
    // The flag is the clinic's decision. A configured provider does not overrule it.
    process.env.SARVAM_API_KEY = 'sk_sarvam';
    env.WA_AI_RECEPTIONIST = false;
    expect(aiReceptionistEnabled()).toBe(false);
  });

  it('stays off when the chosen provider has no key', () => {
    delete process.env.SARVAM_API_KEY;
    env.WA_AI_RECEPTIONIST = true;
    expect(isAiConfigured()).toBe(false);
    expect(aiReceptionistEnabled()).toBe(false);
  });

  it('follows AI_PROVIDER rather than assuming one', () => {
    // Named OpenAI explicitly: then an OpenAI key is what counts, and a Sarvam
    // key is not a substitute.
    process.env.AI_PROVIDER = 'openai';
    process.env.SARVAM_API_KEY = 'sk_sarvam';
    env.OPENAI_API_KEY = undefined;
    env.WA_AI_RECEPTIONIST = true;
    expect(aiProvider()).toBe('openai');
    expect(aiReceptionistEnabled()).toBe(false);

    env.OPENAI_API_KEY = 'sk_openai';
    expect(aiReceptionistEnabled()).toBe(true);
  });
});
