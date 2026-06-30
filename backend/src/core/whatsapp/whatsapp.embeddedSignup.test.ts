import { describe, it, expect } from 'vitest';

// pickBusinessId is a pure helper (no env/DB) — import without a .js extension.
import { pickBusinessId } from './whatsapp.embeddedSignup';

describe('pickBusinessId — resolve owning Business id from a WABA response', () => {
  it('prefers owner_business_info for an owned WABA', () => {
    expect(
      pickBusinessId({ owner_business_info: { id: 'biz_owner' }, on_behalf_of_business_info: { id: 'biz_obo' } })
    ).toBe('biz_owner');
  });

  it('falls back to on_behalf_of_business_info (shared / OBO)', () => {
    expect(pickBusinessId({ on_behalf_of_business_info: { id: 'biz_obo' } })).toBe('biz_obo');
  });

  it('returns null when no business info is present', () => {
    expect(pickBusinessId({ id: 'waba1', name: 'X' })).toBeNull();
  });

  it('is null-safe for empty / undefined input', () => {
    expect(pickBusinessId(undefined)).toBeNull();
    expect(pickBusinessId(null)).toBeNull();
    expect(pickBusinessId({})).toBeNull();
  });
});
