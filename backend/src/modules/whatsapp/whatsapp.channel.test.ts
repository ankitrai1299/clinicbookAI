import { describe, it, expect } from 'vitest';

// The PURE channel-routing decision helpers — extracted so the multi-tenant
// inbound/outbound routing rule is testable without a DB (import without a .js
// extension so Vite resolves the .ts source).
import { decideInboundClinic, selectChannelCreds } from './whatsapp.channel';

const ENV_PNID = 'env_phone_111';
const ENV_CLINIC = 'clinic_env';
const ENV_TOKEN = 'env-token-abc';

describe('decideInboundClinic — which clinic owns an inbound message', () => {
  it('binds to the channel row when one matched the phone_number_id', () => {
    expect(
      decideInboundClinic({
        channelClinicId: 'clinic_b',
        phoneNumberId: 'phone_b',
        envPhoneNumberId: ENV_PNID,
        envClinicId: ENV_CLINIC
      })
    ).toBe('clinic_b');
  });

  it('falls back to the env default clinic for the env number', () => {
    expect(
      decideInboundClinic({
        channelClinicId: null,
        phoneNumberId: ENV_PNID,
        envPhoneNumberId: ENV_PNID,
        envClinicId: ENV_CLINIC
      })
    ).toBe(ENV_CLINIC);
  });

  it('refuses to guess (null) for an unknown number with no channel row', () => {
    expect(
      decideInboundClinic({
        channelClinicId: null,
        phoneNumberId: 'phone_unknown',
        envPhoneNumberId: ENV_PNID,
        envClinicId: ENV_CLINIC
      })
    ).toBeNull();
  });

  it('prefers the channel row even when the number also equals the env number', () => {
    // A channel row claiming the env number wins over the env default mapping.
    expect(
      decideInboundClinic({
        channelClinicId: 'clinic_b',
        phoneNumberId: ENV_PNID,
        envPhoneNumberId: ENV_PNID,
        envClinicId: ENV_CLINIC
      })
    ).toBe('clinic_b');
  });

  it('returns null when the env default channel is not configured', () => {
    expect(
      decideInboundClinic({ channelClinicId: null, phoneNumberId: ENV_PNID })
    ).toBeNull();
  });
});

describe('selectChannelCreds — which number/token a clinic sends with', () => {
  it("uses the clinic's own channel creds when it has a row", () => {
    expect(
      selectChannelCreds({
        clinicId: 'clinic_b',
        channel: { phoneNumberId: 'phone_b', accessToken: 'token-b' },
        envPhoneNumberId: ENV_PNID,
        envToken: ENV_TOKEN,
        envClinicId: ENV_CLINIC
      })
    ).toEqual({ clinicId: 'clinic_b', phoneNumberId: 'phone_b', accessToken: 'token-b' });
  });

  it('uses the env default channel for the env clinic when it has no row', () => {
    expect(
      selectChannelCreds({
        clinicId: ENV_CLINIC,
        channel: null,
        envPhoneNumberId: ENV_PNID,
        envToken: ENV_TOKEN,
        envClinicId: ENV_CLINIC
      })
    ).toEqual({ clinicId: ENV_CLINIC, phoneNumberId: ENV_PNID, accessToken: ENV_TOKEN });
  });

  it('does NOT lend the env default channel to a different clinic', () => {
    // The env token belongs to the env clinic only — a stranger clinic with no
    // row gets nothing rather than messaging from someone else's number.
    expect(
      selectChannelCreds({
        clinicId: 'clinic_b',
        channel: null,
        envPhoneNumberId: ENV_PNID,
        envToken: ENV_TOKEN,
        envClinicId: ENV_CLINIC
      })
    ).toBeNull();
  });

  it('uses the env default when no env clinic is pinned (single-tenant back-compat)', () => {
    expect(
      selectChannelCreds({
        clinicId: 'whatever',
        channel: null,
        envPhoneNumberId: ENV_PNID,
        envToken: ENV_TOKEN
      })
    ).toEqual({ clinicId: 'whatever', phoneNumberId: ENV_PNID, accessToken: ENV_TOKEN });
  });

  it('returns null when neither a channel row nor an env default applies', () => {
    expect(selectChannelCreds({ clinicId: 'clinic_b', channel: null })).toBeNull();
  });
});
