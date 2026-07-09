import { apiFetch } from './client';

export type ApiKeyMode = 'LIVE' | 'TEST';
export type ApiScope = 'read' | 'write';

export interface ApiKeySummary {
  id: string;
  name: string;
  /** Safe display slice, e.g. "ck_live_a1b2c3". The rest is never retrievable. */
  prefix: string;
  mode: ApiKeyMode;
  scopes: ApiScope[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyList {
  keys: ApiKeySummary[];
  /** Null until the clinic mints its first TEST key. */
  sandboxClinicId: string | null;
}

export interface IssuedApiKey extends Omit<ApiKeySummary, 'lastUsedAt' | 'revokedAt' | 'createdAt'> {
  /** Shown ONCE, in this response only. */
  plaintext: string;
  clinicId: string;
}

export const listApiKeys = () => apiFetch<ApiKeyList>('/api/api-keys');

export const createApiKey = (body: { name: string; mode: ApiKeyMode; scopes: ApiScope[] }) =>
  apiFetch<IssuedApiKey>('/api/api-keys', { method: 'POST', body: JSON.stringify(body) });

export const revokeApiKey = (id: string) =>
  apiFetch<{ id: string; revoked: boolean }>(`/api/api-keys/${id}`, { method: 'DELETE' });
