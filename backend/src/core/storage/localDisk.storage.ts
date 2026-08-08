import fs from 'fs';
import os from 'os';
import path from 'path';

import type { StoragePort, StoredObject } from './storage.port.js';

// Local disk. The default, and the only backend that needs no configuration —
// which is exactly why it must announce that it is NOT durable: on Railway this
// is the container's own filesystem, so a deploy or a restart takes every
// recorded consultation with it.
//
// Fine for local development. In production it is a placeholder until an
// S3-compatible bucket is configured.

const ROOT = path.resolve(process.env.MEDISCRIBE_AUDIO_DIR ?? path.join(os.tmpdir(), 'mediscribe-uploads'));

// A key is `clinics/<id>/<folder>/<file>`; map it onto nested directories. Every
// segment is resolved and re-checked against ROOT so a crafted key with `..`
// cannot write outside the upload root.
const pathFor = (key: string): string => {
  const full = path.resolve(ROOT, key);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    throw new Error(`Refusing to use a key that escapes the upload root: ${key}`);
  }
  return full;
};

const TYPE_SUFFIX = '.type'; // content type kept beside the bytes

export const localDiskStorage: StoragePort = {
  name: `local-disk(${ROOT})`,
  durable: false,

  async put(key, body, contentType) {
    const file = pathFor(key);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, body);
    await fs.promises.writeFile(file + TYPE_SUFFIX, contentType, 'utf8');
  },

  async get(key): Promise<StoredObject | null> {
    const file = pathFor(key);
    try {
      const body = await fs.promises.readFile(file);
      const contentType = await fs.promises
        .readFile(file + TYPE_SUFFIX, 'utf8')
        .catch(() => 'application/octet-stream');
      return { body, contentType: contentType.trim() || 'application/octet-stream' };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  },

  async delete(key) {
    const file = pathFor(key);
    await fs.promises.rm(file, { force: true });
    await fs.promises.rm(file + TYPE_SUFFIX, { force: true });
  }
};
