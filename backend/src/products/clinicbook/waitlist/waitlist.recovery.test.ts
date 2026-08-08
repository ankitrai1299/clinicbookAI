import { describe, it, expect, vi, beforeEach } from 'vitest';

import { eventBus } from '../../../core/events/index.js';

const autoOfferFreedSlot = vi.fn(async () => null);
vi.mock('./waitlist.service.js', () => ({ autoOfferFreedSlot: (...a: unknown[]) => autoOfferFreedSlot(...(a as [])) }));

const { registerWaitlistRecovery } = await import('./waitlist.recovery.js');

// Cancelling an appointment used to call autoOfferFreedSlot directly from
// core/appointments. It now travels over appointment.cancelled instead. Nothing
// covered that path before, so this proves the rewiring kept the behaviour —
// a silent break here means waitlisted patients are never offered a freed slot,
// which no one would notice until a clinic complained.
describe('waitlist recovery on cancellation', () => {
  const date = new Date('2026-08-12T00:00:00.000Z');

  beforeEach(() => {
    eventBus.clear();
    autoOfferFreedSlot.mockClear();
    registerWaitlistRecovery();
  });

  it('offers the freed slot when an appointment is cancelled', () => {
    eventBus.emit('appointment.cancelled', {
      clinicId: 'clinic-1',
      appointmentId: 'appt-1',
      patientId: 'pat-1',
      doctorId: 'doc-1',
      appointmentDate: date,
      appointmentTime: '10:00 AM'
    });

    expect(autoOfferFreedSlot).toHaveBeenCalledWith('clinic-1', 'doc-1', date, '10:00 AM');
  });

  it('ignores a cancellation that frees no identifiable slot', () => {
    // Both fields are optional on the event (partner webhooks share the shape),
    // so the handler must not offer a slot it cannot name.
    eventBus.emit('appointment.cancelled', { clinicId: 'clinic-1', appointmentId: 'appt-1', doctorId: 'doc-1' });
    expect(autoOfferFreedSlot).not.toHaveBeenCalled();
  });

  it('does not let a failed offer escape into the cancel path', async () => {
    // The bus is fire-and-forget: a rejection here must stay logged, never
    // surface as a failed cancellation for the patient.
    autoOfferFreedSlot.mockRejectedValueOnce(new Error('waitlist down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      eventBus.emit('appointment.cancelled', {
        clinicId: 'clinic-1',
        appointmentId: 'appt-1',
        doctorId: 'doc-1',
        appointmentDate: date,
        appointmentTime: '10:00 AM'
      })
    ).not.toThrow();

    await new Promise((r) => setImmediate(r));
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
