// Registering this phone for push notifications, from the web side.
//
// The shell (the Android app) obtains the device's Expo push token and hands it
// to this page — it has no session of its own, and duplicating login into the
// native layer would mean a second copy of the JWT on a second storage
// mechanism expiring on its own schedule. So the page, which already holds the
// session, does the registering.
//
// The shell sets `window.__NATIVE_PUSH__` AND fires `native-push-token`,
// because the token can arrive before or after this code runs. Handling only
// one of those orders is how push ends up working on a warm start and failing
// on a cold one.
//
// In a browser none of this exists and every function here is a no-op.

import { API_BASE } from '../api/client';

export interface NativePush {
  token: string;
  product: 'clinicbook' | 'mediscribe';
  platform: string;
}

const read = (): NativePush | null => {
  const value = (window as unknown as { __NATIVE_PUSH__?: NativePush }).__NATIVE_PUSH__;
  return value?.token ? value : null;
};

/** The token this device last registered, so a reload does not re-post it. */
const REGISTERED_KEY = 'native_push_registered';

const registerWithBackend = async (push: NativePush): Promise<void> => {
  const token = localStorage.getItem('auth_token');
  // No session yet: the shell will re-inject on the next page load, and this
  // runs again after sign-in.
  if (!token) return;
  if (localStorage.getItem(REGISTERED_KEY) === push.token) return;

  const res = await fetch(`${API_BASE}/api/notifications/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ token: push.token, product: push.product, platform: push.platform }),
  });

  if (!res.ok) {
    // Not fatal, and not worth interrupting anyone over — the app works
    // identically without push. Logged so it is findable.
    console.warn('[push] device registration failed', res.status);
    return;
  }
  localStorage.setItem(REGISTERED_KEY, push.token);
};

/**
 * Start listening. Safe to call on every mount; safe to call in a browser.
 *
 * Returns a cleanup function.
 */
export const initNativePush = (): (() => void) => {
  const onToken = () => {
    const push = read();
    if (push) void registerWithBackend(push);
  };

  // Already injected (warm start), and again whenever the shell re-injects.
  onToken();
  window.addEventListener('native-push-token', onToken);
  return () => window.removeEventListener('native-push-token', onToken);
};

/**
 * Forget this device on sign-out, so a shared phone stops buzzing for whoever
 * signed in before.
 *
 * Best-effort and deliberately not awaited by the sign-out path: a user must
 * never be held on a screen they are trying to leave because a network call is
 * slow.
 */
export const unregisterNativePush = (): void => {
  const push = read();
  const token = localStorage.getItem('auth_token');
  localStorage.removeItem(REGISTERED_KEY);
  if (!push || !token) return;

  void fetch(`${API_BASE}/api/notifications/devices/${encodeURIComponent(push.token)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
};
