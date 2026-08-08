import { describe, it, expect, beforeEach, vi } from 'vitest';

import { capabilityRegistry, invoke } from '../../core/mcp/index.js';

const addToWaitlist = vi.fn(async () => ({ id: 'wl-1' }));
const claimWaitlistOffer = vi.fn(async () => ({ id: 'wl-1', status: 'BOOKED' }));
vi.mock('./waitlist/waitlist.service.js', () => ({
  addToWaitlist: (...a: unknown[]) => addToWaitlist(...(a as [])),
  claimWaitlistOffer: (...a: unknown[]) => claimWaitlistOffer(...(a as []))
}));

const { registerWaitlistCapabilities } = await import('./clinicbook.capabilities.js');

// The dashboard assistant used to import the waitlist service straight out of
// ClinicBook, which was the last thing keeping core from being shippable on its
// own. It goes through the registry now — so these tests pin down both halves:
// the capability does the same work, and its ABSENCE is survivable.
describe('waitlist as a ClinicBook capability', () => {
  beforeEach(() => {
    capabilityRegistry.clear();
    addToWaitlist.mockClear();
    claimWaitlistOffer.mockClear();
  });

  const staff = { clinicId: 'c1', channel: 'dashboard' as const, actor: { kind: 'staff' as const } };
  const patient = {
    clinicId: 'c1',
    channel: 'whatsapp' as const,
    actor: { kind: 'patient' as const, patientId: 'p1' }
  };

  it('adds a patient to the waitlist with the priority the caller asked for', async () => {
    registerWaitlistCapabilities();
    await invoke(staff, 'waitlist.add', { patientId: 'p1', priority: 3 });
    expect(addToWaitlist).toHaveBeenCalledWith('c1', { patientId: 'p1', priority: 3 });
  });

  it('claims an offer for the patient in context, never one passed in', async () => {
    // Identity comes from the channel's authenticated actor. Taking a patientId
    // from the conversation would let one patient claim another's offer.
    registerWaitlistCapabilities();
    await invoke(patient, 'waitlist.claim', { patientId: 'someone-else' });
    expect(claimWaitlistOffer).toHaveBeenCalledWith('c1', 'p1');
  });

  it('is simply absent when ClinicBook is not registered', () => {
    // A scribe-only deployment. The assistant checks has() and tells the user
    // the waitlist isn't on their plan, rather than importing a missing module.
    expect(capabilityRegistry.has('waitlist.add')).toBe(false);
    expect(capabilityRegistry.has('waitlist.claim')).toBe(false);
  });
});
