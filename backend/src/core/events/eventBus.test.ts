import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { eventBus } from './eventBus.js';

describe('eventBus', () => {
  beforeEach(() => eventBus.clear());
  afterEach(() => vi.restoreAllMocks());

  it('delivers the payload to a subscribed handler', async () => {
    const seen: unknown[] = [];
    eventBus.on('appointment.completed', (p) => {
      seen.push(p);
    });

    eventBus.emit('appointment.completed', { clinicId: 'c1', appointmentId: 'a1' });
    await Promise.resolve();

    expect(seen).toEqual([{ clinicId: 'c1', appointmentId: 'a1' }]);
  });

  it('delivers to every subscriber', async () => {
    const a = vi.fn();
    const b = vi.fn();
    eventBus.on('appointment.completed', a);
    eventBus.on('appointment.completed', b);

    eventBus.emit('appointment.completed', { clinicId: 'c', appointmentId: 'a' });
    await Promise.resolve();

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('isolates handlers: one throwing does not stop the others or the emitter', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ok = vi.fn();
    eventBus.on('appointment.completed', () => {
      throw new Error('boom');
    });
    eventBus.on('appointment.completed', ok);

    expect(() =>
      eventBus.emit('appointment.completed', { clinicId: 'c', appointmentId: 'a' })
    ).not.toThrow();
    await Promise.resolve();

    expect(ok).toHaveBeenCalledOnce();
  });

  it('swallows async handler rejections (never throws to the emitter)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    eventBus.on('appointment.completed', async () => {
      throw new Error('async boom');
    });

    expect(() =>
      eventBus.emit('appointment.completed', { clinicId: 'c', appointmentId: 'a' })
    ).not.toThrow();
  });

  it('is a no-op when there are no subscribers', () => {
    expect(() =>
      eventBus.emit('consultation.finalized', { clinicId: 'c', consultationNoteId: 'n1' })
    ).not.toThrow();
  });

  it('unsubscribe stops further delivery', async () => {
    const fn = vi.fn();
    const off = eventBus.on('appointment.completed', fn);
    off();

    eventBus.emit('appointment.completed', { clinicId: 'c', appointmentId: 'a' });
    await Promise.resolve();

    expect(fn).not.toHaveBeenCalled();
    expect(eventBus.handlerCount('appointment.completed')).toBe(0);
  });
});
