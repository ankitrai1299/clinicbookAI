// OpenAI Whisper transcription (exact spoken text, no translation). Ported from
// the reference NovaScribe app — multilingual prompt + language mapping.

import OpenAI, { toFile } from 'openai';

import { env } from '../../../config/env.js';

const apiKey = (env.OPENAI_API_KEY || '').trim();
const openai = new OpenAI({ apiKey });

const MULTILINGUAL_PROMPT =
  'Doctor–patient medical consultation. Transcribe exactly what is spoken, word for word, ' +
  'preserving the original language and sentence structure (English, Hindi, Hinglish, Urdu, or mixed). ' +
  'Do not translate or summarise. ' +
  'Clinical terms that may appear: fever, cough, cold, body ache, headache, vomiting, diarrhoea, ' +
  'hypertension, diabetes, dengue, typhoid, asthma, anaemia, BP, CBC, ECG, X-ray, ultrasound, ' +
  'paracetamol, azithromycin, amoxicillin, pantoprazole, metformin, amlodipine, cetirizine, ' +
  'ibuprofen, dolo, augmentin, mg, ml, tablet, syrup, OD, BD, TDS.';

const LANGUAGE_CODES: Record<string, string> = {
  english: 'en', en: 'en', hindi: 'hi', hi: 'hi', tamil: 'ta', ta: 'ta',
  telugu: 'te', te: 'te', bengali: 'bn', bn: 'bn', marathi: 'mr', mr: 'mr',
  gujarati: 'gu', gu: 'gu', kannada: 'kn', kn: 'kn', malayalam: 'ml', ml: 'ml',
  punjabi: 'pa', pa: 'pa'
};

const mapLanguage = (selected?: string): string | undefined => {
  const key = (selected || '').trim().toLowerCase();
  if (!key || key === 'auto' || key === 'auto detect') return undefined;
  return LANGUAGE_CODES[key];
};

export const transcribeAudio = async (
  buffer: Buffer,
  mimetype: string,
  selectedLanguage?: string
): Promise<string> => {
  if (!apiKey) {
    throw new Error('No transcription API key configured. Set OPENAI_API_KEY in backend/.env.');
  }

  const file = await toFile(buffer, 'consultation.webm', { type: mimetype || 'audio/webm' });
  const language = mapLanguage(selectedLanguage);

  const response = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    prompt: MULTILINGUAL_PROMPT,
    temperature: 0,
    response_format: 'text',
    ...(language ? { language } : {})
  });

  return (typeof response === 'string' ? response : (response as { text?: string }).text ?? '').trim();
};
