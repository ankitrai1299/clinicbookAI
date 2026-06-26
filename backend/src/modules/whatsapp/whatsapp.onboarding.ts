// WhatsApp Channel onboarding — the self-serve path that makes a clinic
// multi-tenant on WhatsApp. Given a clinic's own Cloud API credentials it:
//
//   1. VALIDATES them against Meta (the phone_number_id + token must actually
//      resolve, so we never store dead creds).
//   2. VALIDATES the webhook configuration (is our app subscribed to this WABA's
//      webhooks?) and auto-subscribes when asked — without this, Meta delivers no
//      inbound messages for the number.
//   3. ENCRYPTS the access token at rest (AES-256-GCM when WA_CHANNEL_ENC_KEY is
//      set; plaintext otherwise for dev/back-compat).
//   4. PERSISTS a WhatsAppChannel row bound to THIS clinic (one number per
//      clinic; a number already claimed by another clinic is rejected).
//   5. Clears the channel resolution caches so routing picks it up immediately.
//
// WhatsAppChannel is the routing table (looked up by phoneNumberId BEFORE a
// clinic is known), so it uses the RAW prisma client — never tenant-scoped. The
// clinicId is set explicitly from the authenticated caller.

import { AxiosInstance } from 'axios';

import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { buildWhatsAppClient } from '../../config/whatsapp.js';
import { AppError } from '../../utils/AppError.js';
import { clearChannelCaches } from './whatsapp.channel.js';
import { deriveKey, encryptSecret, isEncrypted } from './whatsapp.crypto.js';

export interface OnboardChannelInput {
  phoneNumberId: string;
  // Meta WhatsApp Business Account id (a.k.a. Business ID / WABA id).
  wabaId: string;
  accessToken: string;
  // Optional per-channel webhook secrets (fall back to env when omitted).
  appSecret?: string;
  verifyToken?: string;
  // Auto-subscribe our app to this WABA's webhooks (default true).
  subscribeWebhook?: boolean;
}

export interface ChannelVerification {
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
}

export interface WebhookValidation {
  subscribed: boolean;
  attemptedSubscribe: boolean;
  detail: string;
}

export interface PublicChannel {
  id: string;
  clinicId: string;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhoneNumber: string | null;
  status: string;
  tokenEncrypted: boolean;
  updatedAt: Date;
}

export interface OnboardResult {
  channel: PublicChannel;
  verification: ChannelVerification;
  webhook: WebhookValidation;
}

const metaError = (err: unknown, fallback: string): string => {
  const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return e?.response?.data?.error?.message ?? e?.message ?? fallback;
};

// 1. Confirm the phone_number_id + token resolve (and surface the number/name).
const verifyPhoneNumber = async (
  client: AxiosInstance,
  phoneNumberId: string
): Promise<ChannelVerification> => {
  try {
    const res = await client.get(`/${phoneNumberId}`, {
      params: { fields: 'display_phone_number,verified_name,quality_rating' }
    });
    return {
      displayPhoneNumber: res.data?.display_phone_number,
      verifiedName: res.data?.verified_name,
      qualityRating: res.data?.quality_rating
    };
  } catch (err) {
    throw new AppError(
      `WhatsApp credential validation failed: ${metaError(err, 'phone number id / token rejected by Meta')}`,
      400
    );
  }
};

// 2. Validate (and optionally fix) the webhook subscription on the WABA. Without
// an app subscription Meta delivers NO inbound messages for the number, so this
// is the heart of "validate webhook configuration".
export const validateWebhookSubscription = async (
  client: AxiosInstance,
  wabaId: string,
  subscribe: boolean
): Promise<WebhookValidation> => {
  let subscribed = false;
  try {
    const res = await client.get(`/${wabaId}/subscribed_apps`);
    subscribed = Array.isArray(res.data?.data) && res.data.data.length > 0;
  } catch (err) {
    // Couldn't read the subscription (token lacks whatsapp_business_management, or
    // wabaId wrong) — report rather than fail the whole onboarding.
    return {
      subscribed: false,
      attemptedSubscribe: false,
      detail: `Could not read webhook subscription: ${metaError(err, 'subscribed_apps unreadable')}`
    };
  }

  if (subscribed) {
    return { subscribed: true, attemptedSubscribe: false, detail: 'App already subscribed to this WABA.' };
  }
  if (!subscribe) {
    return {
      subscribed: false,
      attemptedSubscribe: false,
      detail: 'App is NOT subscribed to this WABA — inbound messages will not be delivered.'
    };
  }
  try {
    await client.post(`/${wabaId}/subscribed_apps`);
    return { subscribed: true, attemptedSubscribe: true, detail: 'Subscribed the app to this WABA.' };
  } catch (err) {
    return {
      subscribed: false,
      attemptedSubscribe: true,
      detail: `Auto-subscribe failed: ${metaError(err, 'POST subscribed_apps rejected')}`
    };
  }
};

const toPublic = (row: {
  id: string;
  clinicId: string;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhoneNumber: string | null;
  status: string;
  accessToken: string;
  updatedAt: Date;
}): PublicChannel => ({
  id: row.id,
  clinicId: row.clinicId,
  phoneNumberId: row.phoneNumberId,
  wabaId: row.wabaId,
  displayPhoneNumber: row.displayPhoneNumber,
  status: row.status,
  tokenEncrypted: isEncrypted(row.accessToken),
  updatedAt: row.updatedAt
});

export const onboardWhatsAppChannel = async (
  clinicId: string,
  input: OnboardChannelInput
): Promise<OnboardResult> => {
  const client = buildWhatsAppClient(input.accessToken);

  // 1 + 2: validate credentials and webhook against Meta BEFORE persisting.
  const verification = await verifyPhoneNumber(client, input.phoneNumberId);
  const webhook = await validateWebhookSubscription(client, input.wabaId, input.subscribeWebhook ?? true);

  // One number per clinic: a phoneNumberId already claimed elsewhere is rejected
  // so a clinic can never hijack another clinic's WhatsApp number/routing.
  const existing = await prisma.whatsAppChannel.findUnique({
    where: { phoneNumberId: input.phoneNumberId },
    select: { clinicId: true }
  });
  if (existing && existing.clinicId !== clinicId) {
    throw new AppError('This WhatsApp number is already onboarded to another clinic.', 409);
  }

  // 3: encrypt the token at rest.
  const key = env.WA_CHANNEL_ENC_KEY ? deriveKey(env.WA_CHANNEL_ENC_KEY) : null;
  const accessToken = encryptSecret(input.accessToken, key);

  // 4: persist, bound to THIS clinic (upsert keyed on the unique phoneNumberId).
  const row = await prisma.whatsAppChannel.upsert({
    where: { phoneNumberId: input.phoneNumberId },
    create: {
      clinicId,
      phoneNumberId: input.phoneNumberId,
      wabaId: input.wabaId,
      displayPhoneNumber: verification.displayPhoneNumber ?? null,
      accessToken,
      appSecret: input.appSecret ?? null,
      verifyToken: input.verifyToken ?? null,
      status: 'ACTIVE'
    },
    update: {
      clinicId,
      wabaId: input.wabaId,
      displayPhoneNumber: verification.displayPhoneNumber ?? null,
      accessToken,
      appSecret: input.appSecret ?? null,
      verifyToken: input.verifyToken ?? null,
      status: 'ACTIVE'
    }
  });

  // 5: drop caches so inbound routing + outbound sends use the new channel now.
  clearChannelCaches();

  return { channel: toPublic(row), verification, webhook };
};

// Current clinic's channel (sanitised — never returns the token).
export const getClinicChannel = async (clinicId: string): Promise<PublicChannel | null> => {
  const row = await prisma.whatsAppChannel.findFirst({
    where: { clinicId },
    orderBy: { updatedAt: 'desc' }
  });
  return row ? toPublic(row) : null;
};
