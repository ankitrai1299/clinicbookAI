// OpenAI Whisper STT provider. Transcribes consultation audio with whisper-1,
// which handles Hindi / English / Hinglish (and other Indian languages) audio.
//
// Uses the same OpenAI key as the rest of the app (OPENAI_API_KEY). Selected via
// NOVASCRIBE_STT_PROVIDER=whisper (the default when a key is present).

import OpenAI, { toFile } from 'openai';

import { env } from '../../../config/env.js';
import { AppError } from '../../../utils/AppError.js';
import type { SttInput, SttProvider, SttResult } from './stt.types.js';

const extFromMime = (mime?: string): string => {
  switch ((mime ?? '').toLowerCase().split(';')[0]) {
    case 'audio/webm':
      return 'webm';
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/m4a':
    case 'audio/mp4':
      return 'm4a';
    case 'audio/ogg':
      return 'ogg';
    default:
      return 'webm';
  }
};

export class WhisperSttProvider implements SttProvider {
  readonly name = 'whisper';

  async transcribe(input: SttInput): Promise<SttResult> {
    if (!env.OPENAI_API_KEY) {
      throw new AppError('Whisper STT needs OPENAI_API_KEY in backend/.env', 503);
    }
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const type = (input.mimeType ?? 'audio/webm').split(';')[0];
    const file = await toFile(input.audio, `consultation.${extFromMime(input.mimeType)}`, { type });

    // Language: a hint helps for short/code-mixed clips; omit to auto-detect.
    // NOVASCRIBE_STT_LANGUAGE sets a default (e.g. 'hi'); '' / unset = auto.
    const language =
      (input.languageHint ?? '').trim() || (process.env.NOVASCRIBE_STT_LANGUAGE ?? '').trim() || undefined;

    const result = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      ...(language ? { language } : {}),
      temperature: 0,
      prompt:
        'Doctor–patient medical consultation at an Indian clinic. Speakers mix Hindi and English (Hinglish). Includes medicine names, symptoms, diagnoses and dosages.'
    });

    const text = (result.text ?? '').trim();
    return {
      text,
      language: language ?? (typeof (result as { language?: string }).language === 'string'
        ? (result as { language?: string }).language
        : undefined)
    };
  }
}
