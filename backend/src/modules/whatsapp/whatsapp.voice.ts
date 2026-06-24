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

import axios from 'axios';
import OpenAI, { toFile } from 'openai';

import { env } from '../../config/env.js';
import { getWhatsAppApiClient } from '../../config/whatsapp.js';

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
export const transcribeWhatsAppVoice = async (mediaId: string): Promise<string | null> => {
  if (!env.OPENAI_API_KEY) return null;

  try {
    // 1. Resolve the short-lived media download URL from the Graph API.
    const client = getWhatsAppApiClient();
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
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` }
    });
    const buffer = Buffer.from(audio.data);

    // 3. Transcribe with Whisper. Filename extension hints the audio container.
    const ext = mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' : mimeType.includes('wav') ? 'wav' : 'ogg';
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const file = await toFile(buffer, `voice.${ext}`, { type: mimeType.split(';')[0] });
    // language: short Hindi/Hinglish clips auto-detect badly (Whisper picks Urdu
    // and mis-hears words like "doctor" → "cardiologist"), so we pin a language
    // (WA_VOICE_LANGUAGE, default "hi"); blank = auto-detect. The prompt primes
    // the booking domain WITHOUT naming any speciality/doctor — naming them would
    // bias Whisper into "hearing" those words when the patient never said them.
    const language = (env.WA_VOICE_LANGUAGE ?? '').trim() || undefined;
    const result = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      ...(language ? { language } : {}),
      temperature: 0,
      prompt: 'Patient booking a doctor appointment at an Indian clinic, speaking Hindi and English.'
    });

    const text = (result.text ?? '').trim();
    console.info('[WhatsApp][voice] transcribed', { mediaId, chars: text.length, preview: text.slice(0, 80) });
    return text || null;
  } catch (err) {
    console.error('[WhatsApp][voice] transcription failed:', err instanceof Error ? err.message : err);
    return null;
  }
};
