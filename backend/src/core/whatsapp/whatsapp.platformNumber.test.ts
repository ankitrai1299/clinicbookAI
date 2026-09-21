import { describe, it, expect, beforeEach, vi } from 'vitest';

const env: Record<string, unknown> = {};
vi.mock('../../config/env.js', () => ({ env: new Proxy({}, { get: (_t, k: string) => env[k] }) }));

vi.mock('../../config/prisma.js', () => ({
  prisma: { whatsAppChannel: { findFirst: vi.fn(async () => null) } },
}));

const { getClinicChannelStatus } = await import('./whatsapp.onboarding.js');

const OWNER = 'clinic-that-owns-the-env-number';

// Whether a clinic with no channel row of its own can still reach its patients.
//
// The env number is not nobody's — WHATSAPP_CLINIC_ID names the one clinic it
// belongs to, and for that clinic messaging works with no channel row at all.
// Reporting it the same as a clinic that genuinely cannot send is what made the
// dashboard warn the only live clinic that patients could not reach it, while
// patients were reaching it.
describe('a clinic with no channel of its own', () => {
  beforeEach(() => {
    for (const k of Object.keys(env)) delete env[k];
    env.WHATSAPP_CLINIC_ID = OWNER;
    env.PHONE_NUMBER_ID = '1234567890';
    env.WHATSAPP_TOKEN = 'tok';
  });

  it('counts as reachable when it owns the platform number', async () => {
    const s = await getClinicChannelStatus(OWNER);
    expect(s.usingPlatformNumber).toBe(true);
    expect(s.channel).toBeNull();
  });

  it('counts as NOT reachable for any other clinic', async () => {
    // This is the whole point of WA_STRICT_CHANNEL: nobody else borrows it.
    const s = await getClinicChannelStatus('some-other-clinic');
    expect(s.usingPlatformNumber).toBe(false);
  });

  it('is not reachable when the env number is not configured at all', async () => {
    delete env.PHONE_NUMBER_ID;
    const s = await getClinicChannelStatus(OWNER);
    expect(s.usingPlatformNumber).toBe(false);
  });

  it('is not reachable when no clinic is pinned to the env number', async () => {
    // An unpinned env number used to be lent to everyone. It is nobody's now.
    delete env.WHATSAPP_CLINIC_ID;
    const s = await getClinicChannelStatus(OWNER);
    expect(s.usingPlatformNumber).toBe(false);
  });
});
