// Strip any trailing slash so `${API_BASE}${path}` never produces a double slash
// (e.g. VITE_API_URL="https://host/" + "/api/auth/login" → ".../api/..." not "...//api/...").
export const API_BASE = ((import.meta.env.VITE_API_URL as string) ?? 'http://localhost:4000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth_token');

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const json = await res.json().catch(() => ({ message: 'Unexpected server error' }));

  if (!res.ok) {
    throw new ApiError(res.status, (json as { message?: string }).message ?? res.statusText);
  }

  return (json as { data: T }).data;
}
