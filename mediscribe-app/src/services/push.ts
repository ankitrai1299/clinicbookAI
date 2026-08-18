// Push notifications for the doctor's phone.
//
// ─────────────────────────────────────────────────────────────────────────────
// DIVERGENCE FROM THE REFERENCE APP — deliberate, and approved.
//
// This app is otherwise reproduced byte-for-byte from its reference, and that
// rule has been kept everywhere else. This file, its two dependencies
// (expo-notifications, expo-device), the android.permissions entry, and the two
// calls in src/context/Auth.tsx are the ONLY additions.
//
// Why the exception was worth it: the reference app has no notion of a server
// that pushes to it, so a doctor learned about a new appointment only by
// opening the app. Everything else this app does is faithful; being silent when
// a patient books is not a design decision worth preserving.
//
// If this app is ever re-copied from its reference, THIS FILE AND THOSE FIVE
// TOUCH POINTS MUST BE RE-APPLIED. See docs/DIVERGENCES.md.
// ─────────────────────────────────────────────────────────────────────────────
//
// Unlike the ClinicBook WebView shell, this app holds its own session, so it
// registers the device with the backend directly — there is no page to hand the
// token to.

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { API_ROOT } from '../config';
import { getSessionToken } from './api';

/**
 * Show notifications while the app is in the FOREGROUND too.
 *
 * Android otherwise swallows them when the app is open — which is exactly when
 * the doctor is most likely to be looking at the phone and least likely to
 * believe the feature works.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Android needs a channel, or the notification arrives silent and low-priority. */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Appointments and alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#5B5CEB',
    sound: 'default',
  });
}

/** This device's token, kept so sign-out can unregister exactly it. */
let deviceToken: string | null = null;

/**
 * Ask permission, get the token, and bind it to the signed-in doctor.
 *
 * Returns quietly for every reason it can fail — a simulator, a declined
 * prompt, an EAS project without FCM credentials, a backend that is down. Push
 * is an addition; nothing that already works may depend on it.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    await ensureChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const projectId =
      (Notifications as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId ??
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!data) return;
    deviceToken = data;

    const session = getSessionToken();
    if (!session) return;

    const res = await fetch(`${API_ROOT}/api/notifications/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` },
      body: JSON.stringify({ token: data, product: 'mediscribe', platform: Platform.OS }),
    });
    if (!res.ok) console.warn('[push] device registration failed', res.status);
  } catch (err) {
    // In a release build the usual cause is missing FCM credentials on the EAS
    // project. Expo's own message does not point anywhere useful, so say it.
    console.warn(
      '[push] could not register for notifications — if this is a release build, check FCM ' +
        'credentials for this EAS project. The app works normally without push.',
      err,
    );
  }
}

/**
 * Forget this device on sign-out.
 *
 * A clinic phone is shared. Without this, the next doctor to pick it up gets
 * the previous one's appointment notifications.
 */
export async function unregisterFromPush(): Promise<void> {
  const token = deviceToken;
  const session = getSessionToken();
  deviceToken = null;
  if (!token || !session) return;
  try {
    await fetch(`${API_ROOT}/api/notifications/devices/${encodeURIComponent(token)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session}` },
    });
  } catch {
    // Sign-out must never be blocked by a network call.
  }
}
