// WhatsApp voice-note support.
//
//   Patient voice note → download media (Graph API) → transcribe (OpenAI Whisper)
//   → text → fed into the inbound pipeline with AI understanding forced on.
//
// Voice messages are inherently free-form natural language ("mujhe kal subah
// doctor se milna hai"), so they are routed through the AI receptionist
// understanding layer even when WA_AI_RECEPTIONIST is off for typed text — typed
// text stays on the deterministic FSM. Gated to an allowlist of phone numbers
// (WA_VOICE_TEST_NUMBERS) while the feature is being validated.

import { describeText } from '../observability/redact.js';
import axios from 'axios';
import OpenAI, { toFile } from 'openai';

import { env } from '../../config/env.js';
import { buildWhatsAppClient, getWhatsAppApiClient } from '../../config/whatsapp.js';
import { getChannelCreds, resolveClinicIdByPhoneNumberId } from './whatsapp.channel.js';
import { isAiConfigured } from '../ai/provider.js';

// National key = last 10 digits, so "917903884686" and "7903884686" match.
const nationalKey = (s: string): string => {
  const d = s.replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
};

const SPECIAL = ['*', 'all', 'off', 'none', 'disabled'];
let allowlistCache: { raw: string; set: Set<string>; wildcard: boolean; disabled: boolean } | null = null;
const parsedAllowlist = () => {
  const raw = env.WA_VOICE_TEST_NUMBERS ?? '';
  if (!allowlistCache || allowlistCache.raw !== raw) {
    const entries = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const disabled = entries.some((e) => e === 'off' || e === 'none' || e === 'disabled');
    // Default (blank) and "*"/"all" → enabled for EVERYONE. Specific numbers →
    // restrict to those. "off"/"none"/"disabled" → turn the feature off.
    const wildcard = !disabled && (entries.length === 0 || entries.includes('*') || entries.includes('all'));
    allowlistCache = {
      raw,
      disabled,
      wildcard,
      set: new Set(entries.filter((e) => !SPECIAL.includes(e)).map(nationalKey))
    };
  }
  return allowlistCache;
};

// True when voice transcription should run for this sender. Enabled for everyone
// by default (and for "*"/"all"); restrict by listing numbers; disable with
// "off". The OpenAI key requirement is enforced in transcribeWhatsAppVoice (a
// missing key yields a "please type" fallback rather than silent dropping).
export const isVoiceAiEnabledFor = (phone: string): boolean => {
  const { set, wildcard, disabled } = parsedAllowlist();
  if (disabled) return false;
  if (wildcard) return true;
  return set.has(nationalKey(phone));
};

// Download a WhatsApp media object by id and transcribe it. Returns the trimmed
// transcript, or null if anything fails (the caller stays silent / logs). Whisper
// auto-detects the spoken language, so Hindi / English / Hinglish all work.
export const transcribeWhatsAppVoice = async (
  mediaId: string,
  phoneNumberId?: string | null
): Promise<string | null> => {
  // The transcription below has been Sarvam's for a while. This line was still
  // demanding an OpenAI key, so every voice note a patient sent was dropped
  // before it reached the engine that would have understood it.
  if (!isAiConfigured()) return null;

  try {
    // Resolve THIS clinic's WhatsApp token from the number the note arrived on, so
    // media on a secondary clinic's number downloads with the right bearer — the
    // env token only authorises the env default channel. Falls back to the env
    // client/token when no per-clinic channel applies.
    const clinicId = await resolveClinicIdByPhoneNumberId(phoneNumberId);
    const creds = await getChannelCreds(clinicId);
    const client = creds ? buildWhatsAppClient(creds.accessToken) : getWhatsAppApiClient();
    const bearer = creds?.accessToken ?? env.WHATSAPP_TOKEN;

    // 1. Resolve the short-lived media download URL from the Graph API.
    const meta = await client.get(`/${mediaId}`);
    const mediaUrl: string | undefined = meta.data?.url;
    const mimeType: string = meta.data?.mime_type ?? 'audio/ogg';
    if (!mediaUrl) {
      console.error('[WhatsApp][voice] No media URL returned for', mediaId);
      return null;
    }

    // 2. Download the bytes. The CDN URL still requires the WhatsApp bearer token.
    const audio = await axios.get<ArrayBuffer>(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 20000,
      headers: { Authorization: `Bearer ${bearer}` }
    });
    const buffer = Buffer.from(audio.data);

    // 3. Transcribe with Sarvam — the same engine the scribe uses, and an Indian
    // one, which ABDM's "no data leaves India" checklist item makes a
    // requirement rather than a preference.
    //
    // It also removes the Whisper quirk this code was written around: short
    // Hindi/Hinglish clips auto-detected as Urdu and turned "doctor" into
    // "cardiologist", so a language had to be pinned. Sarvam is built for these
    // languages; WA_VOICE_LANGUAGE still pins one when a clinic wants it, and
    // anything unset or unmapped lets Sarvam detect.
    const { transcribeAudio } = await import('../ai/stt.js');
    const language = (env.WA_VOICE_LANGUAGE ?? '').trim() || undefined;
    const text = (await transcribeAudio(buffer, mimeType.split(';')[0], language)).trim();
    // No preview. Eighty characters of a patient describing their symptoms
    // identifies both the person and the condition.
    console.info('[WhatsApp][voice] transcribed', { mediaId, length: describeText(text) });
    return text || null;
  } catch (err) {
    console.error('[WhatsApp][voice] transcription failed:', err instanceof Error ? err.message : err);
    return null;
  }
};
