// Meta WhatsApp Embedded Signup — the one-click clinic onboarding path.
//
//   Frontend FB.login (Embedded Signup popup) yields a short-lived OAuth `code`
//   plus session info (phone_number_id, waba_id). This module:
//     1. exchanges the code for a business access token (server-side, needs the
//        Meta app secret),
//     2. resolves the owning Business id from the WABA,
//     3. hands everything to onboardWhatsAppChannel() which verifies the number,
//        subscribes the webhook, encrypts + stores the token, upserts the
//        WhatsAppChannel for this clinic, and clears the routing cache.
//
// No env vars, no DB edits, no manual webhook setup per clinic — that is the
// whole point. The platform configures META_APP_ID / app secret / META_CONFIG_ID
// ONCE; each clinic just clicks "Connect WhatsApp".

import axios from 'axios';

import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { buildWhatsAppClient } from '../../config/whatsapp.js';
import { onboardWhatsAppChannel, OnboardResult } from './whatsapp.onboarding.js';

export interface EmbeddedSignupInput {
  code: string;
  phoneNumberId: string;
  wabaId: string;
}

export interface EmbeddedConfig {
  configured: boolean;
  appId?: string;
  configId?: string;
  graphVersion: string;
}

const graphUrl = (path: string): string => `https://graph.facebook.com/${env.META_GRAPH_VERSION}${path}`;

const metaError = (err: unknown, fallback: string): string => {
  const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return e?.response?.data?.error?.message ?? e?.message ?? fallback;
};

// The Meta app secret used for the server-side code exchange. Falls back to
// WHATSAPP_APP_SECRET (same Meta app already used for webhook HMAC).
export const appSecret = (): string | undefined => env.META_APP_SECRET ?? env.WHATSAPP_APP_SECRET;

// Is Embedded Signup configured at the platform level?
export const isEmbeddedSignupConfigured = (): boolean => Boolean(env.META_APP_ID && appSecret() && env.META_CONFIG_ID);

// Public (non-secret) config the front-end SDK needs to launch the popup.
export const getEmbeddedConfig = (): EmbeddedConfig => ({
  configured: isEmbeddedSignupConfigured(),
  appId: env.META_APP_ID,
  configId: env.META_CONFIG_ID,
  graphVersion: env.META_GRAPH_VERSION
});

// PURE: pick the owning Business id from a WABA fields response (owner business
// for owned WABAs, on-behalf-of business for shared/OBO). Unit-testable.
export const pickBusinessId = (data: unknown): string | null => {
  const d = (data ?? {}) as {
    owner_business_info?: { id?: string };
    on_behalf_of_business_info?: { id?: string };
  };
  return d.owner_business_info?.id ?? d.on_behalf_of_business_info?.id ?? null;
};

// Exchange the Embedded Signup OAuth code for an access token.
export const exchangeCodeForToken = async (code: string): Promise<string> => {
  const appId = env.META_APP_ID;
  const secret = appSecret();
  if (!appId || !secret) {
    throw new AppError('WhatsApp Embedded Signup is not configured (META_APP_ID / app secret missing).', 500);
  }
  try {
    const res = await axios.get(graphUrl('/oauth/access_token'), {
      params: { client_id: appId, client_secret: secret, code },
      timeout: 15000
    });
    const token: string | undefined = res.data?.access_token;
    if (!token) throw new AppError('Meta did not return an access token for the authorization code.', 400);
    return token;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(`Failed to exchange the Meta authorization code: ${metaError(err, 'code exchange failed')}`, 400);
  }
};

// Resolve the owning Business id for a WABA (best-effort — null on failure, since
// businessId is informational and must never block onboarding).
export const resolveBusinessId = async (accessToken: string, wabaId: string): Promise<string | null> => {
  try {
    const res = await buildWhatsAppClient(accessToken).get(`/${wabaId}`, {
      params: { fields: 'id,name,owner_business_info,on_behalf_of_business_info' }
    });
    return pickBusinessId(res.data);
  } catch {
    return null;
  }
};

// The full one-click flow: code → token → business id → onboard the channel.
export const completeEmbeddedSignup = async (
  clinicId: string,
  input: EmbeddedSignupInput
): Promise<OnboardResult> => {
  const accessToken = await exchangeCodeForToken(input.code);
  const businessId = await resolveBusinessId(accessToken, input.wabaId);
  return onboardWhatsAppChannel(clinicId, {
    phoneNumberId: input.phoneNumberId,
    wabaId: input.wabaId,
    businessId: businessId ?? undefined,
    accessToken,
    subscribeWebhook: true
  });
};
