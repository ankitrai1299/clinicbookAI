// Transcript translation (preserves medical terms). Ported from the reference app.

import OpenAI from 'openai';

import { env } from '../../../config/env.js';

const apiKey = (env.OPENAI_API_KEY || '').trim();
const openai = new OpenAI({ apiKey });

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali',
  mr: 'Marathi', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi'
};

export const translateTranscript = async (text: string, targetLanguage?: string): Promise<string> => {
  const code = (targetLanguage || '').trim().toLowerCase();
  const source = (text || '').trim();
  if (!code || code === 'auto' || !source) return source;

  const targetName = LANGUAGE_NAMES[code];
  if (!targetName) return source;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          `You are a medical translator. Translate the user's medical consultation transcript into ${targetName}. ` +
          'Output ONLY the translated text — no quotes, no notes, no explanation. ' +
          'Preserve all medical terms, medicine names, dosages, numbers, units and symptoms accurately. ' +
          'Keep proper nouns and brand medicine names as-is. ' +
          `If the text is already in ${targetName}, return it unchanged.`
      },
      { role: 'user', content: source }
    ]
  });

  return (completion.choices[0]?.message?.content || '').trim() || source;
};
