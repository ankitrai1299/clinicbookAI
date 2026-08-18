// Push notifications — the ones that appear on the lock screen.
//
// The bell inside the app and the SSE stream only reach a dashboard that is
// already OPEN. That is the gap this closes: a patient books on WhatsApp at 9pm
// and, until now, nobody knew until somebody opened the app the next morning.
//
// Delivery goes through Expo's push service rather than to FCM directly. Both
// apps are Expo builds, so Expo already owns the credential relationship with
// Google; talking to FCM ourselves would mean holding a second set of Google
// service-account keys for no gain.
//
// Three rules shape this file:
//
//   A PUSH NEVER FAILS THE THING THAT CAUSED IT. A booking must not fail
//   because a phone is unreachable. Every path here swallows its own errors.
//
//   DEAD TOKENS ARE DELETED, not retried. When Expo says DeviceNotRegistered
//   the app has been uninstalled or the token rotated; keeping it means every
//   future send carries a receipt that will never arrive, and a push queue full
//   of those is how the whole thing silently rots.
//
//   NOTHING CLINICAL IN THE PAYLOAD. A push renders on a LOCKED screen, in front
//   of whoever is holding the phone. "New appointment" is fine; a patient's name
//   beside their complaint is a disclosure to whoever glances at the desk.

import { prisma } from '../../config/prisma.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
const BATCH = 100;

export type PushProduct = 'clinicbook' | 'mediscribe';

export interface PushMessage {
  title: string;
  body: string;
  /** Delivered to the app so a tap can open the right screen. Ids only. */
  data?: Record<string, string>;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Is this a token Expo will accept at all? Saves a pointless round trip. */
export const isExpoPushToken = (token: string): boolean =>
  /^Expo(nent)?PushToken\[[^\]]+\]$/.test((token || '').trim());

/**
 * Register (or refresh) a device.
 *
 * Keyed on the TOKEN, so the same phone re-registering after a reinstall
 * updates its row instead of accumulating duplicates — and so a device that
 * moves to a different user of the same clinic is re-pointed rather than
 * silently kept on the old one.
 */
export const registerDevice = async (input: {
  clinicId: string;
  userId: string;
  token: string;
  product: PushProduct;
  platform?: string;
}) => {
  const token = input.token.trim();
  if (!isExpoPushToken(token)) throw new Error('That is not an Expo push token');

  return prisma.devicePushToken.upsert({
    where: { token },
    create: {
      clinicId: input.clinicId,
      userId: input.userId,
      token,
      product: input.product,
      platform: input.platform ?? 'android'
    },
    update: {
      clinicId: input.clinicId,
      userId: input.userId,
      product: input.product,
      platform: input.platform ?? 'android',
      // A device that comes back was not dead after all.
      failedAt: null
    }
  });
};

/** Forget a device — called on sign-out, so a shared phone stops buzzing. */
export const unregisterDevice = async (token: string): Promise<void> => {
  await prisma.devicePushToken.deleteMany({ where: { token: token.trim() } });
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Send to a set of tokens. Returns how many were accepted.
 *
 * Expo answers with one ticket per message, in order. A ticket is not delivery —
 * it is acceptance — but the errors that matter here (DeviceNotRegistered) come
 * back in it, so this is where dead tokens are cleaned up.
 */
const sendToTokens = async (tokens: string[], message: PushMessage): Promise<number> => {
  if (!tokens.length) return 0;
  let accepted = 0;

  for (const group of chunk(tokens, BATCH)) {
    const payload = group.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      sound: 'default',
      // Android: without a channel the notification is silent on newer versions.
      channelId: 'default',
      priority: 'high'
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        console.error('[push] Expo rejected the batch', res.status, await res.text().catch(() => ''));
        continue;
      }

      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];

      const dead: string[] = [];
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') {
          accepted++;
          return;
        }
        if (ticket.details?.error === 'DeviceNotRegistered') dead.push(group[i]);
        else console.error('[push] delivery error', ticket.details?.error ?? ticket.message);
      });

      if (dead.length) {
        // The app was uninstalled or the token rotated. Retrying it forever is
        // how a push queue fills with garbage nobody notices.
        await prisma.devicePushToken.deleteMany({ where: { token: { in: dead } } });
        console.info(`[push] removed ${dead.length} unregistered device(s)`);
      }
    } catch (err) {
      console.error('[push] send failed', err);
    }
  }

  if (accepted) {
    await prisma.devicePushToken
      .updateMany({ where: { token: { in: tokens } }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }

  return accepted;
};

/**
 * Push to every registered device of a clinic.
 *
 * `products` narrows it: an appointment concerns both the front desk and the
 * doctor, but a scribe-only event should not buzz a receptionist's phone.
 *
 * Fire-and-forget by design — see the rules at the top of this file.
 */
export const pushToClinic = (
  clinicId: string,
  message: PushMessage,
  products: PushProduct[] = ['clinicbook', 'mediscribe']
): void => {
  void (async () => {
    try {
      const rows = await prisma.devicePushToken.findMany({
        where: { clinicId, product: { in: products } },
        select: { token: true }
      });
      if (!rows.length) return;
      const sent = await sendToTokens(rows.map((r) => r.token), message);
      console.info(`[push] ${message.title} → ${sent}/${rows.length} device(s) in clinic ${clinicId}`);
    } catch (err) {
      console.error('[push] could not push to clinic', clinicId, err);
    }
  })();
};

/** Push to one person's devices — used where an event belongs to a single user. */
export const pushToUser = (userId: string, message: PushMessage): void => {
  void (async () => {
    try {
      const rows = await prisma.devicePushToken.findMany({
        where: { userId },
        select: { token: true }
      });
      if (rows.length) await sendToTokens(rows.map((r) => r.token), message);
    } catch (err) {
      console.error('[push] could not push to user', userId, err);
    }
  })();
};
