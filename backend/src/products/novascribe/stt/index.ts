// STT provider selection. Defaults to the local mock so the system runs clean
// without external keys. Set NOVASCRIBE_STT_PROVIDER + the provider's key to use
// a real engine (added behind this same switch — pipeline code is unaffected).

import { MockSttProvider } from './mock.stt.js';
import type { SttProvider } from './stt.types.js';

let cached: SttProvider | null = null;

export const getSttProvider = (): SttProvider => {
  if (cached) {
    return cached;
  }
  const choice = (process.env.NOVASCRIBE_STT_PROVIDER ?? 'mock').trim().toLowerCase();
  switch (choice) {
    // case 'sarvam':   cached = new SarvamSttProvider(); break;
    // case 'whisper':  cached = new WhisperSttProvider(); break;
    // case 'deepgram': cached = new DeepgramSttProvider(); break;
    case 'mock':
    default:
      cached = new MockSttProvider();
  }
  return cached;
};

export type { SttProvider, SttResult, SttInput, TranscriptSegment } from './stt.types.js';
