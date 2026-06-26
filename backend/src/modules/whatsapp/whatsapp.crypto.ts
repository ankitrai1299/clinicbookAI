// Pure symmetric encryption for WhatsApp tokens at rest. NO env / no DB imports
// (the key is passed in), so it is unit-testable in isolation. AES-256-GCM with a
// random 96-bit IV; the stored form is `enc:v1:<iv>:<tag>:<ciphertext>` (base64).
//
// When no key is configured (key === null), encrypt/decrypt are pass-through —
// tokens are stored as plaintext (dev / back-compat). decryptSecret refuses to
// silently return ciphertext: an `enc:v1:` value with no key throws.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';

// Derive a stable 32-byte key from any passphrase (hex, base64, or arbitrary).
export const deriveKey = (secret: string): Buffer => createHash('sha256').update(secret, 'utf8').digest();

export const isEncrypted = (stored: string): boolean => stored.startsWith(PREFIX);

export const encryptSecret = (plain: string, key: Buffer | null): string => {
  if (!key) return plain; // no key configured → store plaintext
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
};

export const decryptSecret = (stored: string, key: Buffer | null): string => {
  if (!isEncrypted(stored)) return stored; // plaintext (stored when no key was set)
  if (!key) {
    throw new Error('WA_CHANNEL_ENC_KEY is required to decrypt an encrypted WhatsApp token');
  }
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted WhatsApp token');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
};
