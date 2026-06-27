import { apiFetch } from './client';

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

export const loginUser = (body: { email: string; password: string }) =>
  apiFetch<AuthResult>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });

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
