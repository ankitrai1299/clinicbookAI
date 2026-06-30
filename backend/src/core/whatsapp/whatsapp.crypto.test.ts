import { describe, it, expect } from 'vitest';

// Pure crypto module — no env/DB imports, so it is testable in isolation (import
// without a .js extension so Vite resolves the .ts source).
import { deriveKey, encryptSecret, decryptSecret, isEncrypted } from './whatsapp.crypto';

const KEY = deriveKey('a-test-passphrase');
const OTHER_KEY = deriveKey('a-different-passphrase');
const TOKEN = 'EAAG-some-long-whatsapp-access-token-1234567890';

describe('whatsapp.crypto — token encryption at rest', () => {
  it('round-trips a token through encrypt → decrypt with a key', () => {
    const enc = encryptSecret(TOKEN, KEY);
    expect(enc).not.toBe(TOKEN);
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptSecret(enc, KEY)).toBe(TOKEN);
  });

  it('uses a random IV so the same plaintext encrypts to different ciphertexts', () => {
    expect(encryptSecret(TOKEN, KEY)).not.toBe(encryptSecret(TOKEN, KEY));
  });

  it('stores plaintext (pass-through) when no key is configured', () => {
    const enc = encryptSecret(TOKEN, null);
    expect(enc).toBe(TOKEN);
    expect(isEncrypted(enc)).toBe(false);
  });

  it('decrypts a plaintext value to itself even with a key (back-compat)', () => {
    expect(decryptSecret(TOKEN, KEY)).toBe(TOKEN);
    expect(decryptSecret(TOKEN, null)).toBe(TOKEN);
  });

  it('refuses to return an encrypted value when no key is available', () => {
    const enc = encryptSecret(TOKEN, KEY);
    expect(() => decryptSecret(enc, null)).toThrow(/WA_CHANNEL_ENC_KEY is required/);
  });

  it('throws on a malformed encrypted value', () => {
    expect(() => decryptSecret('enc:v1:onlyonepart', KEY)).toThrow(/Malformed/);
  });

  it('throws (auth-tag mismatch) when decrypting with the wrong key', () => {
    const enc = encryptSecret(TOKEN, KEY);
    expect(() => decryptSecret(enc, OTHER_KEY)).toThrow();
  });

  it('throws when the ciphertext has been tampered with', () => {
    const enc = encryptSecret(TOKEN, KEY);
    // Format is `enc:v1:<iv>:<tag>:<ciphertext>` → 5 colon-delimited fields.
    const parts = enc.split(':');
    const data = parts[4];
    parts[4] = `${data.slice(0, -2)}AA`;
    expect(() => decryptSecret(parts.join(':'), KEY)).toThrow();
  });
});
