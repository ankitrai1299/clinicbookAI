// Registering this device for push notifications.
//
// The problem this solves: the in-app bell only reaches a dashboard that is
// already OPEN. A patient books on WhatsApp at 9pm and nobody knows until
// somebody opens the app the next morning. A notification on the lock screen is
// the only thing that closes that gap.
//
// WHO REGISTERS THE DEVICE, AND WHY IT IS THE WEB PAGE
//
// The shell has no session — the JWT lives in the web page's localStorage,
// which is where every other authenticated call is already made from. Rather
// than duplicate login into the shell (a second copy of the token, on a second
// storage mechanism, expiring on its own schedule), the shell obtains the push
// token from Expo and HANDS IT TO THE PAGE. The page registers it with the
// backend using the session it already holds.
//
// So the direction is: native → web (here is your device's token), then
// web → backend (register it against my user).
//
// If any of this fails the app carries on exactly as before. Push is an
// addition; nothing already working may depend on it.

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { APP_FLAVOR } from './config';

/**
 * Show notifications even while the app is in the FOREGROUND.
 *
 * Without this Android silently swallows them when the app is open, which is
 * exactly when a receptionist is most likely to be looking at the phone and
 * least likely to believe the feature works.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

/**
 * Android needs a CHANNEL or the notification arrives silent and low-priority —
 * which for a clinic desk is the same as not arriving.
 */
const ensureAndroidChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Appointments and alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#059669',
    sound: 'default'
  });
};

/**
 * Ask permission and return this device's Expo push token.
 *
 * Returns null — never throws — for every reason it can fail: an emulator with
 * no push support, a user who declined, or an EAS project without FCM
 * credentials. The caller treats a null as "no push on this device" and the app
 * is otherwise untouched.
 */
export const getPushToken = async (): Promise<string | null> => {
  try {
    // A simulator has no push transport at all; asking produces a confusing
    // error rather than a token.
    if (!Device.isDevice) {
      console.info('[push] not a physical device — skipping');
      return null;
    }

    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') {
      console.info('[push] permission not granted');
      return null;
    }

    // projectId is required for a standalone build to resolve the right Expo
    // push endpoint. It comes from app.json's extra.eas.projectId.
    const projectId =
      (Notifications as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId ??
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

    const { data } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return data ?? null;
  } catch (err) {
    // The most likely cause in a fresh project is missing FCM credentials on
    // the EAS project. Say so, because the message Expo returns on its own does
    // not point anywhere useful.
    console.warn(
      '[push] could not get a push token — if this is a release build, check that FCM ' +
        'credentials are configured for this EAS project. Continuing without push.',
      err
    );
    return null;
  }
};

/**
 * The snippet injected into the page once a token exists.
 *
 * Sets a global AND fires an event: the page may load before or after the token
 * arrives, and handling only one of those orders is how this ends up working on
 * a warm start and silently failing on a cold one.
 */
export const injectPushToken = (token: string): string => `
  (function () {
    try {
      window.__NATIVE_PUSH__ = ${JSON.stringify({ token, product: APP_FLAVOR, platform: Platform.OS })};
      window.dispatchEvent(new CustomEvent('native-push-token', { detail: window.__NATIVE_PUSH__ }));
    } catch (e) {}
  })();
  true;
`;
