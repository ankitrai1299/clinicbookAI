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

// ── Web app (WebView) ────────────────────────────────────────
// The phone app is a thin shell around the SAME web NovaScribe the browser uses,
// so it's feature-for-feature identical and always in sync. Point this at the
// deployed frontend (Vercel). Override per-build with EXPO_PUBLIC_WEB_URL.
const WEB_URL_FALLBACK = 'https://clinicbook-ai-yj2d.vercel.app';
export const WEB_ROOT = (process.env.EXPO_PUBLIC_WEB_URL || WEB_URL_FALLBACK || '').replace(/\/+$/, '');

// ── App flavor ───────────────────────────────────────────────
// ONE shell, TWO apps. The build flavor is set per EAS profile via EXPO_PUBLIC_APP
// (see eas.json). Default is NovaScribe so existing builds are unchanged.
//   novascribe → the doctor's AI scribe   (web reads ?app=novascribe)
//   clinicbook → the clinic booking desk  (web reads ?app=clinicbook → dashboard)
// Both talk to the SAME backend and load the SAME deployed web, so they stay in
// sync; only the entry point and branding differ.
export const APP_FLAVOR: 'novascribe' | 'clinicbook' =
  process.env.EXPO_PUBLIC_APP === 'clinicbook' ? 'clinicbook' : 'novascribe';

export const APP_LABEL = APP_FLAVOR === 'clinicbook' ? 'ClinicBook AI' : 'NovaScribe';

// Open straight into the product (the web app reads `?app=…`, skips the product
// hub → same login → the full product).
export const WEB_APP_URL = `${WEB_ROOT}/?app=${APP_FLAVOR}`;
