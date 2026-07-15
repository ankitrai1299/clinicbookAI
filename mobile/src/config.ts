// ── Backend connection ───────────────────────────────────────
// The mobile app talks to the SAME backend as the web app (same endpoints,
// same payloads, same responses). The web app reads VITE_API_BASE_URL; the
// mobile equivalent is EXPO_PUBLIC_API_URL (Expo inlines EXPO_PUBLIC_* env vars
// at build time). Set it in an `.env` file at the project root, e.g.:
//
//   EXPO_PUBLIC_API_URL=https://novascribe-api.onrender.com
//
// If unset, it falls back to API_BASE_URL_FALLBACK below — replace that with
// your deployed backend URL so the app works out of the box.

// Production backend base URL (no trailing /api, no trailing slash). This is the
// same public API the web app uses — NOT a secret. Database credentials live
// only on the backend; the app never holds them. Override per-build with the
// EXPO_PUBLIC_API_URL env var if needed.
const API_BASE_URL_FALLBACK = 'https://clinicbookai-production.up.railway.app';

// Resolved backend origin (env wins; trailing slashes stripped). Mirrors the
// web app's `API_ROOT`.
export const API_ROOT = (
  process.env.EXPO_PUBLIC_API_URL ||
  API_BASE_URL_FALLBACK ||
  ''
).replace(/\/+$/, '');

// MediScribe is mounted on the ClinicBook backend at /api/mediscribe (behind
// ClinicBook auth). Same endpoints/payloads the web MediScribe uses.
export const API_BASE = `${API_ROOT}/api/mediscribe`;

// ClinicBook auth (login / me) lives at /api/auth — the mobile app logs in with
// the same clinic credentials and gets the shared JWT.
export const AUTH_BASE = `${API_ROOT}/api/auth`;

// Surfaced in the UI so the doctor can see/diagnose connection problems.
export const isApiConfigured = (): boolean => API_ROOT.length > 0;
