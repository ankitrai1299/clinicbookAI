// Local mock STT provider — lets the WHOLE pipeline (understanding → verify →
// drugs → draft) run end-to-end locally with zero external API keys or audio
// infra. It returns a realistic Hinglish consultation transcript so the AI
// stages produce a meaningful SOAP note for local development & demos.
//
// Swap for a real provider (Sarvam/Whisper/Deepgram) via NOVASCRIBE_STT_PROVIDER
// — pipeline code does not change.

import type { SttInput, SttProvider, SttResult } from './stt.types.js';

const SAMPLE_TRANSCRIPT = [
  'Doctor: Namaste, baithiye. Boliye kya taqleef hai?',
  'Patient: Doctor sahab, teen din se tej bukhar hai, sata-attha degree tak chala jata hai. Saath me khaansi aur badan dard bhi hai.',
  'Doctor: Gala kharab hai? Saans lene me dikkat?',
  'Patient: Gala thoda kharab hai, dry cough hai. Saans theek hai. Bhookh bilkul nahi lag rahi.',
  'Doctor: Koi purani bimari? Sugar, BP?',
  'Patient: Nahi, aisa kuch nahi. Pichle saal typhoid hua tha.',
  'Doctor: Theek hai. Throat thoda red hai, chest clear hai. Lagta hai viral fever ke saath throat infection hai.',
  'Doctor: Main aapko Paracetamol 650 likh raha hoon, bukhar ke liye din me teen baar, paanch din. Azithromycin 500 ek baar subah, teen din. Aur Cetirizine raat ko sone se pehle.',
  'Doctor: Paani zyada piyo, aaram karo. CBC aur typhoid test karwa lena. Teen din me bukhar na utre to dobara dikhana.'
].join('\n');

export class MockSttProvider implements SttProvider {
  readonly name = 'mock';

  async transcribe(input: SttInput): Promise<SttResult> {
    // Roughly estimate a duration from the byte size so the UI shows something
    // plausible; content is the canned sample regardless of the bytes.
    const durationSec = Math.max(20, Math.round(input.audio.length / 16000));
    return {
      text: SAMPLE_TRANSCRIPT,
      language: input.languageHint || 'hi',
      durationSec,
      segments: SAMPLE_TRANSCRIPT.split('\n').map((line) => {
        const [, speaker] = line.match(/^(Doctor|Patient):/) ?? [];
        return {
          speaker: speaker ? speaker.toLowerCase() : 'unknown',
          text: line.replace(/^(Doctor|Patient):\s*/, '')
        };
      })
    };
  }
}
