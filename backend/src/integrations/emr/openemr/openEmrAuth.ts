// OpenEMR OAuth2 token provider. Real OpenEMR FHIR does NOT accept a static
// bearer — you register an API client and exchange credentials for a short-lived
// access token at {base}/oauth2/{site}/token. This module does the "password"
// grant (simplest for a backend pilot), caches the token until just before it
// expires, and transparently refreshes it. The result is a `() => Promise<string>`
// that HttpFhirTransport calls per request.
//
// The HTTP POST is injectable so the caching/refresh logic is unit-testable with
// no network. For managed sandboxes that hand you a ready token, skip all this
// and pass the raw string to the transport instead.

export interface OpenEmrOAuthConfig {
  tokenUrl: string; // e.g. https://host/oauth2/default/token
  clientId: string;
  clientSecret?: string; // confidential clients only
  username: string;
  password: string;
  scope: string; // e.g. "openid offline_access api:fhir user/Patient.read ..."
  userRole?: string; // 'users' (staff) | 'patient'; default 'users'
  insecureTls?: boolean; // LOCAL DEV ONLY: accept a self-hosted OpenEMR's self-signed cert
}

export interface TokenResponse {
  access_token: string;
  expires_in?: number; // seconds
  refresh_token?: string;
}

// Injectable POST (form-urlencoded → JSON token response). Default uses axios.
export type TokenPoster = (url: string, form: URLSearchParams) => Promise<TokenResponse>;

const makeDefaultPoster = (insecureTls?: boolean): TokenPoster => async (url, form) => {
  const [{ default: axios }, https] = await Promise.all([import('axios'), import('node:https')]);
  const res = await axios.post<TokenResponse>(url, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15_000,
    ...(insecureTls ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) } : {})
  });
  return res.data;
};

// `now` is injectable so expiry math is testable with a fixed clock. `poster`
// defaults to an axios POST (honouring cfg.insecureTls for local self-signed EMRs).
export const createOpenEmrTokenProvider = (
  cfg: OpenEmrOAuthConfig,
  poster: TokenPoster = makeDefaultPoster(cfg.insecureTls),
  now: () => number = () => Date.now()
): (() => Promise<string>) => {
  let cached: { token: string; expiresAt: number; refreshToken?: string } | null = null;

  const passwordForm = (): URLSearchParams => {
    const f = new URLSearchParams();
    f.set('grant_type', 'password');
    f.set('client_id', cfg.clientId);
    if (cfg.clientSecret) f.set('client_secret', cfg.clientSecret);
    f.set('scope', cfg.scope);
    f.set('username', cfg.username);
    f.set('password', cfg.password);
    f.set('user_role', cfg.userRole ?? 'users');
    return f;
  };

  const refreshForm = (refreshToken: string): URLSearchParams => {
    const f = new URLSearchParams();
    f.set('grant_type', 'refresh_token');
    f.set('refresh_token', refreshToken);
    f.set('client_id', cfg.clientId);
    if (cfg.clientSecret) f.set('client_secret', cfg.clientSecret);
    f.set('scope', cfg.scope);
    return f;
  };

  const store = (res: TokenResponse): string => {
    // 60s safety margin so we never present a token that expires mid-request.
    cached = {
      token: res.access_token,
      expiresAt: now() + ((res.expires_in ?? 3600) - 60) * 1000,
      refreshToken: res.refresh_token ?? cached?.refreshToken
    };
    return cached.token;
  };

  const fetchFresh = async (): Promise<string> => {
    // Prefer a refresh when we have one; fall back to a full password grant if
    // the refresh is rejected (expired/revoked).
    if (cached?.refreshToken) {
      try {
        return store(await poster(cfg.tokenUrl, refreshForm(cached.refreshToken)));
      } catch {
        cached = cached ? { ...cached, refreshToken: undefined } : null;
      }
    }
    return store(await poster(cfg.tokenUrl, passwordForm()));
  };

  return async () => {
    if (cached && cached.expiresAt > now()) return cached.token;
    return fetchFresh();
  };
};
