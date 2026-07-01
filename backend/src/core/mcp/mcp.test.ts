import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { capabilityRegistry } from './capabilityRegistry.js';
import { invoke, handle } from './mcp.service.js';
import { setIntentClassifier } from './mcp.router.js';
import type { McpContext } from './mcp.types.js';

const ctx: McpContext = {
  clinicId: 'c1',
  channel: 'whatsapp',
  actor: { kind: 'patient', patientId: 'p1' }
};

describe('mcp.invoke (precise path)', () => {
  beforeEach(() => capabilityRegistry.clear());

  it('runs the capability handler with ctx + input', async () => {
    const handler = vi.fn(async (_c, input: { x: number }) => input.x * 2);
    capabilityRegistry.register({ name: 'math.double', product: 'core', description: '', handler });

    const out = await invoke(ctx, 'math.double', { x: 21 });
    expect(out).toBe(42);
    expect(handler).toHaveBeenCalledWith(ctx, { x: 21 });
  });

  it('throws on an unknown capability', async () => {
    await expect(invoke(ctx, 'does.not.exist')).rejects.toThrow(/Unknown capability/);
  });

  it('lets handler errors propagate unchanged', async () => {
    capabilityRegistry.register({
      name: 'boom',
      product: 'core',
      description: '',
      handler: () => {
        throw new Error('handler failed');
      }
    });
    await expect(invoke(ctx, 'boom')).rejects.toThrow('handler failed');
  });
});

describe('mcp.handle (conversational path)', () => {
  beforeEach(() => capabilityRegistry.clear());
  afterEach(() => {
    setIntentClassifier(null);
    vi.restoreAllMocks();
  });

  it('degrades gracefully to unknown when no classifier is wired', async () => {
    const res = await handle(ctx, 'book me a cardiologist');
    expect(res.ok).toBe(false);
    expect(res.intent).toBe('unknown');
    expect(res.capability).toBeNull();
  });

  it('classifies → routes → invokes the matching capability', async () => {
    const handler = vi.fn(async () => ({ appointmentId: 'a1' }));
    capabilityRegistry.register({
      name: 'appointment.book',
      product: 'clinicbook',
      description: '',
      intents: ['book'],
      handler
    });
    setIntentClassifier(() => ({ intent: 'book', slots: { doctorId: 'd1' } }));

    const res = await handle(ctx, 'book with dr sharma');
    expect(res.ok).toBe(true);
    expect(res.intent).toBe('book');
    expect(res.capability).toBe('appointment.book');
    expect(res.data).toEqual({ appointmentId: 'a1' });
    // Slots from the classifier + the raw text are passed into the capability.
    expect(handler).toHaveBeenCalledWith(ctx, expect.objectContaining({ doctorId: 'd1', text: 'book with dr sharma' }));
  });

  it('reports ok:false (never throws) when the capability fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    capabilityRegistry.register({
      name: 'appointment.book',
      product: 'clinicbook',
      description: '',
      intents: ['book'],
      handler: () => {
        throw new Error('slot taken');
      }
    });
    setIntentClassifier(() => ({ intent: 'book' }));

    const res = await handle(ctx, 'book something');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('slot taken');
    expect(res.capability).toBe('appointment.book');
  });

  it('reports ok:false when a known intent has no registered capability yet', async () => {
    setIntentClassifier(() => ({ intent: 'reminder' })); // PatientLoop not built yet
    const res = await handle(ctx, 'remind me to take medicine');
    expect(res.ok).toBe(false);
    expect(res.intent).toBe('reminder');
    expect(res.capability).toBeNull();
    expect(res.error).toMatch(/reminder/);
  });
});
