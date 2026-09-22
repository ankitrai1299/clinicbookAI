import { describe, it, expect } from 'vitest';

// Pure — no DB, no env.
import { isSharedInboundNumber } from './whatsapp.channel';

// The real ids from the day this broke, so the test reads like the incident.
const NEXTCLINIC = 'cmqkubvis0000rt0pbfkkulae'; // owns the original env number
const ANVAYA = 'cmuawjivr0001mp01lgnzknkr';     // connected its own number
const PLATFORM = 'clinic_platform_doorway';

describe('isSharedInboundNumber — may a binding override the number that was messaged', () => {
  // This is the bug. A patient registered at anvaya sent "hi" to nextclinicAi's
  // number. Because that number was treated as a shared pool, the patient's
  // binding won, anvaya answered — on its OWN WhatsApp number — and
  // nextclinicAi never saw the message. The patient watched a reply land in a
  // different chat from the one they wrote to.
  it('a real clinic’s own number is never shared, even the original one', () => {
    expect(isSharedInboundNumber({ clinicId: NEXTCLINIC, platformClinicId: PLATFORM })).toBe(false);
    expect(isSharedInboundNumber({ clinicId: ANVAYA, platformClinicId: PLATFORM })).toBe(false);
  });

  it('is shared when the platform clinic owns the number', () => {
    expect(isSharedInboundNumber({ clinicId: PLATFORM, platformClinicId: PLATFORM })).toBe(true);
  });

  it('is shared when no clinic owns the number at all', () => {
    expect(isSharedInboundNumber({ clinicId: null, platformClinicId: PLATFORM })).toBe(true);
    expect(isSharedInboundNumber({ clinicId: null, platformClinicId: null })).toBe(true);
  });

  // Most deployments have no platform clinic row. Nothing may be shared then
  // except a number nobody owns — the safe reading, because the alternative is
  // answering as the wrong clinic.
  it('shares nothing owned when there is no platform clinic', () => {
    expect(isSharedInboundNumber({ clinicId: NEXTCLINIC, platformClinicId: null })).toBe(false);
    expect(isSharedInboundNumber({ clinicId: ANVAYA, platformClinicId: null })).toBe(false);
  });
});
