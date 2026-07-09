import { describe, it, expect } from 'vitest';

import { createOpenEmrTokenProvider, type OpenEmrOAuthConfig, type TokenResponse } from './openEmrAuth.js';

const CFG: OpenEmrOAuthConfig = {
  tokenUrl: 'https://emr.test/oauth2/default/token',
  clientId: 'cid',
  clientSecret: 'secret',
  username: 'admin',
  password: 'pass',
  scope: 'openid offline_access api:fhir'
};

// A stub poster that records the grant_type of each request and returns queued
// responses (or throws if the queue entry is an Error).
const makePoster = (responses: Array<TokenResponse | Error>) => {
  const grants: string[] = [];
  let i = 0;
  const poster = async (_url: string, form: URLSearchParams): Promise<TokenResponse> => {
    grants.push(form.get('grant_type') ?? '');
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  return { poster, grants };
};

describe('OpenEMR OAuth2 token provider', () => {
  it('does a password grant on first use and caches until near expiry', async () => {
    let t = 1_000_000;
    const { poster, grants } = makePoster([{ access_token: 'A', expires_in: 3600, refresh_token: 'R' }]);
    const getToken = createOpenEmrTokenProvider(CFG, poster, () => t);

    expect(await getToken()).toBe('A');
    expect(await getToken()).toBe('A'); // cached — no second POST
    expect(grants).toEqual(['password']);
  });

  it('refreshes with the refresh_token once the access token has expired', async () => {
    let t = 1_000_000;
    const { poster, grants } = makePoster([
      { access_token: 'A', expires_in: 3600, refresh_token: 'R' },
      { access_token: 'B', expires_in: 3600, refresh_token: 'R2' }
    ]);
    const getToken = createOpenEmrTokenProvider(CFG, poster, () => t);

    expect(await getToken()).toBe('A');
    t += 3600 * 1000; // jump past expiry (incl. the 60s margin)
    expect(await getToken()).toBe('B');
    expect(grants).toEqual(['password', 'refresh_token']);
  });

  it('falls back to a password grant when the refresh is rejected', async () => {
    let t = 1_000_000;
    const { poster, grants } = makePoster([
      { access_token: 'A', expires_in: 3600, refresh_token: 'R' },
      new Error('invalid_grant'), // refresh rejected
      { access_token: 'C', expires_in: 3600, refresh_token: 'R3' }
    ]);
    const getToken = createOpenEmrTokenProvider(CFG, poster, () => t);

    expect(await getToken()).toBe('A');
    t += 3600 * 1000;
    expect(await getToken()).toBe('C');
    expect(grants).toEqual(['password', 'refresh_token', 'password']);
  });
});
