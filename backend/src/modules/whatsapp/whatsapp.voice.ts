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

let allowlistCache: { raw: string; set: Set<string>; wildcard: boolean } | null = null;
const parsedAllowlist = () => {
  const raw = env.WA_VOICE_TEST_NUMBERS ?? '';
  if (!allowlistCache || allowlistCache.raw !== raw) {
    const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
    allowlistCache = {
      raw,
      wildcard: entries.includes('*'),
      set: new Set(entries.filter((e) => e !== '*').map(nationalKey))
    };
  }
  return allowlistCache;
};

// True when voice transcription should run for this sender. Needs an OpenAI key
// AND the number on the allowlist (or "*"). Empty allowlist → feature off.
export const isVoiceAiEnabledFor = (phone: string): boolean => {
  if (!env.OPENAI_API_KEY) return false;
  const { set, wildcard } = parsedAllowlist();
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
    const result = await openai.audio.transcriptions.create({ file, model: 'whisper-1' });

    const text = (result.text ?? '').trim();
    console.info('[WhatsApp][voice] transcribed', { mediaId, chars: text.length, preview: text.slice(0, 80) });
    return text || null;
  } catch (err) {
    console.error('[WhatsApp][voice] transcription failed:', err instanceof Error ? err.message : err);
    return null;
  }
};
