// Local filesystem audio storage (dev). Files live under NOVASCRIBE_AUDIO_DIR
// (default backend/.novascribe-data/audio), which is git-ignored.

import { promises as fs } from 'fs';
import path from 'path';

import type { AudioStorage } from './storage.types.js';

const BASE_DIR = path.resolve(
  process.cwd(),
  process.env.NOVASCRIBE_AUDIO_DIR ?? '.novascribe-data/audio'
);

// Reject keys that try to escape the base dir.
const safeResolve = (key: string): string => {
  const target = path.resolve(BASE_DIR, key);
  if (!target.startsWith(BASE_DIR + path.sep) && target !== BASE_DIR) {
    throw new Error('Invalid storage key');
  }
  return target;
};

export class LocalAudioStorage implements AudioStorage {
  readonly name = 'local';

  async save(key: string, data: Buffer): Promise<string> {
    const target = safeResolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(safeResolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(safeResolve(key), { force: true });
  }
}
