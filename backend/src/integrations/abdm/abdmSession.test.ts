import { describe, it, expect } from 'vitest';

// The decisions in ABDM session handling that do not need a gateway to test,
// and that fail quietly if wrong: when a cached token stops being usable, what
// lifetime to assume when the gateway does not state one, and the shape of the
// headers V3 rejects a call for.
import { tokenIsUsable, expiryFrom, abdmHeaders } from './abdmSession';

const NOW = 1_800_000_000_000;

describe('tokenIsUsable', () => {
  it('uses a token that is comfortably alive', () => {
    expect(tokenIsUsable({ token: 't', expiresAt: NOW + 600_000 }, NOW)).toBe(true);
  });

  it('retires a token BEFORE its stated expiry', () => {
    // 30 seconds left is inside the one-minute margin. Without it, a token can
    // pass this check and expire while the request it authorises is in flight —
    // and the caller cannot tell that from a genuine rejection.
    expect(tokenIsUsable({ token: 't', expiresAt: NOW + 30_000 }, NOW)).toBe(false);
  });

  it('rejects an already-expired token', () => {
    expect(tokenIsUsable({ token: 't', expiresAt: NOW - 1 }, NOW)).toBe(false);
  });

  it('has nothing to use before the first mint', () => {
    expect(tokenIsUsable(null, NOW)).toBe(false);
  });
});

describe('expiryFrom', () => {
  it('honours the lifetime the gateway states', () => {
    expect(expiryFrom(3600, NOW)).toBe(NOW + 3_600_000);
  });

  it('falls back to half an hour when the gateway says nothing', () => {
    // Well inside every documented ABDM lifetime, so a missing value costs at
    // most an extra mint — never a request sent with a dead token.
    expect(expiryFrom(undefined, NOW)).toBe(NOW + 1_800_000);
  });

  it('treats a nonsensical lifetime as absent rather than trusting it', () => {
    expect(expiryFrom(0, NOW)).toBe(NOW + 1_800_000);
    expect(expiryFrom(-5, NOW)).toBe(NOW + 1_800_000);
  });
});

// ABDM answers 401 — not 400 — when these are missing or malformed, so a wrong
// header is indistinguishable from a wrong secret at the call site. That makes
// them worth pinning down here rather than discovering against the gateway.
describe('abdmHeaders', () => {
  it('makes REQUEST-ID a real UUID', () => {
    // A non-UUID request id is rejected as UNAUTHORISED. Four sandbox calls were
    // lost to this before it was pinned down.
    expect(abdmHeaders()['REQUEST-ID']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('gives every call its own REQUEST-ID', () => {
    // It identifies the call. Reusing one makes a gateway trace impossible to
    // follow at exactly the moment something has gone wrong.
    expect(abdmHeaders()['REQUEST-ID']).not.toBe(abdmHeaders()['REQUEST-ID']);
  });

  it('always sends X-CM-ID', () => {
    // The single header that decided 200 vs 401 across six live sandbox calls
    // with identical credentials.
    expect(abdmHeaders()['X-CM-ID']).toBeTruthy();
  });

  it('stamps TIMESTAMP in the format the gateway accepts', () => {
    expect(abdmHeaders().TIMESTAMP).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
  });
});
