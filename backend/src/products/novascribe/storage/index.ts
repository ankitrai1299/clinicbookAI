// Audio storage selection. Local filesystem by default; production swaps in S3 /
// Supabase Storage here without changing callers.

import { LocalAudioStorage } from './local.storage.js';
import type { AudioStorage } from './storage.types.js';

let cached: AudioStorage | null = null;

export const getAudioStorage = (): AudioStorage => {
  if (cached) {
    return cached;
  }
  const choice = (process.env.NOVASCRIBE_STORAGE ?? 'local').trim().toLowerCase();
  switch (choice) {
    // case 's3':       cached = new S3AudioStorage(); break;
    // case 'supabase': cached = new SupabaseAudioStorage(); break;
    case 'local':
    default:
      cached = new LocalAudioStorage();
  }
  return cached;
};

export type { AudioStorage } from './storage.types.js';
