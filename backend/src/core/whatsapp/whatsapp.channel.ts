// Per-clinic WhatsApp channel resolution — the heart of multi-tenant WhatsApp.
//
//   INBOUND:  metadata.phone_number_id  ──►  resolveClinicIdByPhoneNumberId()  ──►  clinicId
//   OUTBOUND: clinicId                   ──►  resolveSendContext()             ──►  { token, phoneNumberId }
//
// Each clinic has a WhatsAppChannel row (its own number + token). The original
// single clinic keeps working via the env "default channel" (PHONE_NUMBER_ID /
// WHATSAPP_TOKEN bound to WHATSAPP_CLINIC_ID) as a fallback, so nothing breaks
// before channel rows are created.
//
// The phoneNumberId lookup uses the RAW prisma client on purpose: it resolves
// WHICH clinic an inbound belongs to, so it cannot be tenant-scoped (there is no
// clinic yet). This is the WhatsApp analogue of resolving a tenant from a JWT.

import { AxiosInstance } from 'axios';

import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import {
  buildWhatsAppClient,
  getWhatsAppApiClient,
  getWhatsAppPhoneNumberId
} from '../../config/whatsapp.js';
import { AppError } from '../../utils/AppError.js';
import { decryptSecret, deriveKey } from './whatsapp.crypto.js';

export interface ChannelCreds {
  clinicId: string;
  phoneNumberId: string;
  accessToken: string;
}

const encKey = (): Buffer | null => (env.WA_CHANNEL_ENC_KEY ? deriveKey(env.WA_CHANNEL_ENC_KEY) : null);

// ---- PURE decision helpers (unit-tested without a DB) ---------------------

// Which clinic owns an inbound message, given the channel row's clinicId (or
// null when no channel matched the phoneNumberId) and the env default channel.
export const decideInboundClinic = (params: {
  channelClinicId: string | null;
  phoneNumberId: string;
  envPhoneNumberId?: string;
  envClinicId?: string;
}): string | null => {
  if (params.channelClinicId) return params.channelClinicId;
  // Env default channel: the original number maps to WHATSAPP_CLINIC_ID.
  if (
    params.envPhoneNumberId &&
    params.envClinicId &&
    params.phoneNumberId === params.envPhoneNumberId
  ) {
    return params.envClinicId;
  }
  return null;
};

// Which credentials a clinic sends with, given its channel row (or null) and the
// env default channel. Returns null when neither applies.
// `strict` closes the multi-tenant hole in the back-compat branch below: with no
// WHATSAPP_CLINIC_ID pinned, the env default channel would otherwise be lent to
// EVERY clinic, so a clinic that never connected a number would silently message
// patients from the platform's number. Under strict mode the env channel is
// usable only by the clinic explicitly pinned to it.
export const selectChannelCreds = (params: {
  clinicId: string;
  channel: { phoneNumberId: string; accessToken: string } | null;
  envPhoneNumberId?: string;
  envToken?: string;
  envClinicId?: string;
  strict?: boolean;
}): ChannelCreds | null => {
  if (params.channel) {
    return {
      clinicId: params.clinicId,
      phoneNumberId: params.channel.phoneNumberId,
      accessToken: params.channel.accessToken
    };
  }
  // Env default channel applies to the env clinic (or, outside strict mode, when
  // no clinic is pinned at all — the original single-tenant behaviour).
  if (
    params.envPhoneNumberId &&
    params.envToken &&
    (params.strict
      ? params.envClinicId === params.clinicId
      : !params.envClinicId || params.envClinicId === params.clinicId)
  ) {
    return {
      clinicId: params.clinicId,
      phoneNumberId: params.envPhoneNumberId,
      accessToken: params.envToken
    };
  }
  return null;
};

// ---- DB-backed resolvers with a short TTL cache ---------------------------
// Channels change rarely, but tokens can rotate (the dev token expires daily), so
// a short TTL keeps the hot path fast while letting updates propagate.
const CACHE_TTL_MS = 60_000;
type Entry<T> = { value: T; at: number };
const clinicByPhone = new Map<string, Entry<string | null>>();
const credsByClinic = new Map<string, Entry<ChannelCreds | null>>();

const fresh = <T>(e: Entry<T> | undefined, now: number): e is Entry<T> =>
  Boolean(e) && now - (e as Entry<T>).at < CACHE_TTL_MS;

export const resolveClinicIdByPhoneNumberId = async (
  phoneNumberId?: string | null,
  now: number = Date.now()
): Promise<string | null> => {
  if (!phoneNumberId) {
    // No routing key on the webhook → fall back to the env default clinic.
    return env.WHATSAPP_CLINIC_ID ?? null;
  }
  const cached = clinicByPhone.get(phoneNumberId);
  if (fresh(cached, now)) return cached.value;

  const channel = await prisma.whatsAppChannel.findUnique({
    where: { phoneNumberId },
    select: { clinicId: true, status: true }
  });
  const channelClinicId = channel && channel.status === 'ACTIVE' ? channel.clinicId : null;
  const clinicId = decideInboundClinic({
    channelClinicId,
    phoneNumberId,
    envPhoneNumberId: env.PHONE_NUMBER_ID,
    envClinicId: env.WHATSAPP_CLINIC_ID
  });
  clinicByPhone.set(phoneNumberId, { value: clinicId, at: now });
  return clinicId;
};

export const getChannelCreds = async (
  clinicId?: string | null,
  now: number = Date.now()
): Promise<ChannelCreds | null> => {
  const cid = clinicId ?? env.WHATSAPP_CLINIC_ID ?? null;
  if (!cid) {
    // No clinic context at all → env default if present, else nothing.
    if (env.PHONE_NUMBER_ID && env.WHATSAPP_TOKEN) {
      return {
        clinicId: env.WHATSAPP_CLINIC_ID ?? 'env-default',
        phoneNumberId: env.PHONE_NUMBER_ID,
        accessToken: env.WHATSAPP_TOKEN
      };
    }
    return null;
  }

  const cached = credsByClinic.get(cid);
  if (fresh(cached, now)) return cached.value;

  const row = await prisma.whatsAppChannel.findFirst({
    where: { clinicId: cid, status: 'ACTIVE' },
    select: { phoneNumberId: true, accessToken: true }
  });
  const channel = row
    ? { phoneNumberId: row.phoneNumberId, accessToken: decryptSecret(row.accessToken, encKey()) }
    : null;
  const creds = selectChannelCreds({
    clinicId: cid,
    channel,
    envPhoneNumberId: env.PHONE_NUMBER_ID,
    envToken: env.WHATSAPP_TOKEN,
    envClinicId: env.WHATSAPP_CLINIC_ID,
    strict: env.WA_STRICT_CHANNEL
  });
  credsByClinic.set(cid, { value: creds, at: now });
  return creds;
};

export interface SendContext {
  client: AxiosInstance;
  phoneNumberId: string;
}

// Resolve the Graph client + sender phoneNumberId for a clinic's outbound send.
// Per-clinic channel creds win; otherwise the env default channel is used.
//
// That fallback is NOT dead weight — it is the shared-number tier. A clinic can
// onboard with zero Meta setup by sharing a join code, and its patients reach it
// on the PLATFORM's number (see whatsapp.binding.ts). For those clinics, sending
// from the platform number is the product working as designed, not a leak.
//
// WA_STRICT_CHANNEL is for deployments that have retired that tier and want
// every clinic on its own number: it turns the fallback into a hard error so a
// misconfigured clinic is loud instead of silently borrowing the platform's
// identity. Off by default precisely because it disables the shared tier.
export const resolveSendContext = async (clinicId?: string | null): Promise<SendContext> => {
  const creds = await getChannelCreds(clinicId);
  if (creds) {
    return { client: buildWhatsAppClient(creds.accessToken), phoneNumberId: creds.phoneNumberId };
  }
  if (clinicId && env.WA_STRICT_CHANNEL) {
    throw new AppError(
      `Clinic ${clinicId} has no connected WhatsApp number — connect one in Settings before sending. ` +
        '(WA_STRICT_CHANNEL is on, so the shared platform number cannot be used.)',
      409
    );
  }
  return { client: getWhatsAppApiClient(), phoneNumberId: getWhatsAppPhoneNumberId() };
};

// Test/ops helper — drop caches (e.g. after rotating a token or onboarding).
export const clearChannelCaches = (): void => {
  clinicByPhone.clear();
  credsByClinic.clear();
};
