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

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // fetch() only rejects when the request never completed: no network, DNS
    // failure, the server not running, or a response the browser refused to hand
    // over (a CORS-less error page counts). The browser's own wording for all of
    // these is "Failed to fetch", which sent us hunting through application code
    // for what turned out to be a backend that wasn't running at all. Say what it
    // actually means, and name the two things worth checking.
    throw new ApiError(
      0,
      "Can't reach the server. Check your internet connection — the server may also be down or restarting.",
    );
  }

  const json = await res.json().catch(() => ({ message: 'Unexpected server error' }));

  if (!res.ok) {
    throw new ApiError(res.status, (json as { message?: string }).message ?? res.statusText);
  }

  return (json as { data: T }).data;
}
