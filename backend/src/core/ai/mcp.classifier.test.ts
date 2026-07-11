import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM so tests are deterministic (no real API). isAiConfigured defaults
// OFF so the keyword paths are exercised in isolation; individual tests flip it on.
const isAiConfigured = vi.fn(() => false);
const complete = vi.fn();
vi.mock('./llm.js', () => ({
  isAiConfigured: () => isAiConfigured(),
  complete: (...a: unknown[]) => complete(...a)
}));

import { mcpIntentClassifier } from './mcp.classifier.js';
import type { McpContext } from '../mcp/index.js';

const ctx: McpContext = { clinicId: 'c1', channel: 'whatsapp', actor: { kind: 'patient', patientId: 'p1' } };
const intent = async (text: string) => (await mcpIntentClassifier(ctx, text)).intent;

describe('mcpIntentClassifier (brain router)', () => {
  beforeEach(() => {
    isAiConfigured.mockReturnValue(false);
    complete.mockReset();
  });

  it('routes prescription / scribe requests to the prescription intent', async () => {
    expect(await intent('mera prescription bhejo')).toBe('prescription');
    expect(await intent('meri parchi chahiye')).toBe('prescription');
    expect(await intent('doctor ne kya likha hai')).toBe('prescription');
    expect(await intent('meri dawai batao')).toBe('prescription');
  });

  it('routes report / document requests to the document intent', async () => {
    expect(await intent('meri report bhejo')).toBe('document');
    expect(await intent('lab report chahiye')).toBe('document');
  });

  it('routes existing-appointment queries to the status intent', async () => {
    expect(await intent('meri appointment kab hai')).toBe('status');
    expect(await intent('when is my appointment')).toBe('status');
  });

  it('routes full-record / history requests to the record intent', async () => {
    expect(await intent('mera record bhejo')).toBe('record');
    expect(await intent('Give me my records')).toBe('record');
    expect(await intent('my history')).toBe('record');
  });

  it('leaves booking-family messages as unknown (→ fallback FSM, no LLM)', async () => {
    expect(await intent('book appointment')).toBe('unknown');
    expect(await intent('appointment chahiye')).toBe('unknown');
    expect(await intent('kal cardiologist se milna hai')).toBe('unknown');
    expect(await intent('10:00 AM')).toBe('unknown');
    expect(await intent('mereko monday ko ek slot chaiye')).toBe('unknown');
    // AI is OFF here, so the booking guard/keywords decide — never calls the LLM.
    expect(complete).not.toHaveBeenCalled();
  });

  it('uses AI for long-tail phrasings the keywords miss', async () => {
    isAiConfigured.mockReturnValue(true);
    complete.mockResolvedValue('{"intent":"prescription"}');
    // No keyword / booking hint → falls to the AI classifier.
    expect(await intent('bhai wo goli wali cheez bhej do jo doctor ne di thi')).toBe('prescription');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('AI "other" → unknown (booking FSM handles it)', async () => {
    isAiConfigured.mockReturnValue(true);
    complete.mockResolvedValue('{"intent":"other"}');
    expect(await intent('kuch help chahiye thi aapse')).toBe('unknown');
  });
});
