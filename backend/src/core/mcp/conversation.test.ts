import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the DB-backed session store so the orchestrator can be tested in isolation.
vi.mock('./session.service.js', () => ({
  getConversationState: vi.fn(),
  saveConversationState: vi.fn(),
  clearConversationState: vi.fn()
}));

import { runConversation } from './conversation.js';
import { skillRegistry } from './skillRegistry.js';
import { setIntentClassifier } from './mcp.router.js';
import * as session from './session.service.js';
import type { McpContext } from './mcp.types.js';
import type { Skill } from './skill.types.js';

const ctx: McpContext = { clinicId: 'c1', channel: 'whatsapp', actor: { kind: 'patient', patientId: 'p1' } };

const skill = (over: Partial<Skill>): Skill => ({
  name: 'booking',
  product: 'clinicbook',
  handle: async () => ({ reply: 'ok', done: true }),
  ...over
});

describe('runConversation (brain orchestrator)', () => {
  beforeEach(() => {
    skillRegistry.clear();
    vi.clearAllMocks();
    vi.mocked(session.getConversationState).mockResolvedValue({ activeSkill: null, data: {} });
    vi.mocked(session.saveConversationState).mockResolvedValue(undefined);
    vi.mocked(session.clearConversationState).mockResolvedValue(undefined);
  });
  afterEach(() => {
    setIntentClassifier(null);
    vi.restoreAllMocks();
  });

  it('uses the fallback skill WITHOUT classifying when only the fallback exists', async () => {
    const handle = vi.fn(async () => ({ reply: 'hi', done: true }));
    const classifier = vi.fn();
    setIntentClassifier(classifier);
    skillRegistry.register(skill({ name: 'booking', isFallback: true, handle }));

    const res = await runConversation(ctx, 'book me a doctor');

    expect(res.reply).toBe('hi');
    expect(handle).toHaveBeenCalledOnce();
    expect(classifier).not.toHaveBeenCalled(); // slice-1 parity: no extra AI call
    expect(session.clearConversationState).toHaveBeenCalledWith('c1', 'p1', 'whatsapp');
  });

  it('resumes an in-flight skill without re-classifying', async () => {
    vi.mocked(session.getConversationState).mockResolvedValue({ activeSkill: 'booking', data: { step: 2 } });
    const handle = vi.fn(async () => ({ reply: 'next', done: true }));
    const classifier = vi.fn();
    setIntentClassifier(classifier);
    skillRegistry.register(skill({ name: 'booking', isFallback: true, handle }));
    skillRegistry.register(skill({ name: 'reminder', intents: ['reminder'], handle: vi.fn() }));

    await runConversation(ctx, '10 am');

    expect(handle).toHaveBeenCalledOnce();
    expect(classifier).not.toHaveBeenCalled();
  });

  it('persists the active skill + state when a turn is not done', async () => {
    skillRegistry.register(skill({ name: 'booking', isFallback: true, handle: async () => ({ reply: 'pick a slot', done: false, state: { step: 3 } }) }));

    await runConversation(ctx, 'book');

    expect(session.saveConversationState).toHaveBeenCalledWith('c1', 'p1', 'whatsapp', {
      activeSkill: 'booking',
      data: { step: 3 }
    });
    expect(session.clearConversationState).not.toHaveBeenCalled();
  });

  it('classifies and routes to the intent-claiming skill', async () => {
    const reminderHandle = vi.fn(async () => ({ reply: 'reminder set', done: true }));
    skillRegistry.register(skill({ name: 'booking', isFallback: true }));
    skillRegistry.register(skill({ name: 'reminder', intents: ['reminder'], handle: reminderHandle }));
    setIntentClassifier(() => ({ intent: 'reminder' }));

    const res = await runConversation(ctx, 'remind me about my medicine');

    expect(reminderHandle).toHaveBeenCalledOnce();
    expect(res.skill).toBe('reminder');
    expect(res.intent).toBe('reminder');
  });

  it('never throws when a skill fails — settles the session and stays silent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    skillRegistry.register(skill({ name: 'booking', isFallback: true, handle: async () => { throw new Error('boom'); } }));

    const res = await runConversation(ctx, 'book');

    expect(res.reply).toBeNull();
    expect(res.done).toBe(true);
    expect(session.clearConversationState).toHaveBeenCalledWith('c1', 'p1', 'whatsapp');
  });
});
