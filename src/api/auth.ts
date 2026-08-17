import { API_BASE, ApiError, apiFetch } from './client';

export interface AuthUser {
  id: string;
  clinicId: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
}

// Self-service signup no longer returns a token immediately — the owner must
// verify their email (OTP) first. The backend creates the clinic + owner as
// unverified and emails a 6-digit code.
export interface RegisterResult {
  needsVerification: true;
  email: string;
}

export const registerClinic = (body: {
  clinicName: string;
  ownerName: string;
  email: string;
  phone: string;
  password: string;
}) =>
  apiFetch<RegisterResult>('/api/clinics/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });

/**
 * Sign-in stopped halfway: the password was right, a second factor is owed.
 *
 * `mfaToken` proves the password and nothing else. It is short-lived and the
 * only thing that accepts it is the code-verification endpoint.
 */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  message: string;
}

export const isMfaChallenge = (r: AuthResult | MfaChallenge): r is MfaChallenge =>
  (r as MfaChallenge).mfaRequired === true;

/**
 * Sign in.
 *
 * Not written on apiFetch, which throws on any non-2xx and keeps only `data` —
 * the MFA challenge arrives as a 401 WITH a body we need (`mfaToken`), and
 * apiFetch would discard it and report a failed login. The 401 is deliberate on
 * the server side too: a client that knows nothing about MFA must treat this as
 * a failure rather than as a session.
 */
export const loginUser = async (body: { email: string; password: string }): Promise<AuthResult | MfaChallenge> => {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "Can't reach the server. Check your internet connection — the server may also be down or restarting.",
    );
  }

  const json = (await res.json().catch(() => ({}))) as {
    data?: AuthResult;
    message?: string;
    mfaRequired?: boolean;
    mfaToken?: string;
  };

  if (json.mfaRequired && json.mfaToken) {
    return { mfaRequired: true, mfaToken: json.mfaToken, message: json.message ?? '' };
  }
  if (!res.ok || !json.data) {
    throw new ApiError(res.status, json.message ?? res.statusText);
  }
  return json.data;
};

/** Second half of an MFA sign-in: the challenge token plus a code from the app. */
export const verifyMfaCode = async (mfaToken: string, code: string): Promise<AuthResult> => {
  const res = await fetch(`${API_BASE}/api/auth/mfa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mfaToken}` },
    body: JSON.stringify({ code }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: AuthResult; message?: string };
  if (!res.ok || !json.data) throw new ApiError(res.status, json.message ?? 'That code is not valid.');
  return json.data;
};

// ── Managing your own second factor ─────────────────────────────────────────

export const getMfaStatus = () =>
  apiFetch<{ mfaEnabled: boolean; enrolledAt: string | null }>('/api/auth/mfa');

/** Start enrolment. Returns the secret and the otpauth:// URI to render as a QR. */
export const setupMfa = () =>
  apiFetch<{ secret: string; otpauthUrl: string }>('/api/auth/mfa/setup', { method: 'POST' });

/** Confirm a code from the authenticator — only this actually switches it on. */
export const enableMfa = (code: string) =>
  apiFetch<{ mfaEnabled: boolean }>('/api/auth/mfa/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

export const disableMfa = (code: string) =>
  apiFetch<{ mfaEnabled: boolean }>('/api/auth/mfa/disable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

/** End every session this account has, including this one. */
export const signOutEverywhere = () =>
  apiFetch<{ tokenVersion: number }>('/api/auth/sign-out-everywhere', { method: 'POST' });

// ── App passwords: one credential per device ────────────────────────────────

export interface AppPasswordRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export const listAppPasswords = () => apiFetch<AppPasswordRow[]>('/api/auth/app-passwords');

/**
 * Mint one. `plaintext` is in THIS response and nowhere else, ever — the UI has
 * to make the user copy it before the panel closes.
 */
export const createAppPassword = (name: string) =>
  apiFetch<{ id: string; name: string; prefix: string; plaintext: string }>('/api/auth/app-passwords', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

/** Revoke a device. Also ends every session on the account — see the server route. */
export const revokeAppPassword = (id: string) =>
  apiFetch<{ id: string; revoked: boolean }>(`/api/auth/app-passwords/${id}`, { method: 'DELETE' });

// Verify the signup OTP → returns the verified session (token + user).
export const verifyOtp = (body: { email: string; code: string }) =>
  apiFetch<AuthResult>('/api/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const resendOtp = (body: { email: string }) =>
  apiFetch<{ message?: string }>('/api/auth/resend-otp', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getMe = () => apiFetch<AuthUser>('/api/auth/me');
