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

export const registerClinic = (body: {
  clinicName: string;
  ownerName: string;
  email: string;
  phone: string;
  password: string;
}) =>
  apiFetch<AuthResult>('/api/clinics/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const loginUser = (body: { email: string; password: string }) =>
  apiFetch<AuthResult>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getMe = () => apiFetch<AuthUser>('/api/auth/me');
