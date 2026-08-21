// Prove the configured object storage actually works, before trusting it with a
// patient's consultation.
//
// Why this exists: storage failures are SILENT in the worst way. The app falls
// back to local disk, logs one line at boot, and carries on — and every
// recording made after that is destroyed by the next deploy. Nobody notices
// until a doctor asks for a visit from last week.
//
// So this does the round trip for real: write an object, read it back, compare
// the bytes, delete it. Anything less proves nothing — credentials that can PUT
// but not GET look fine at upload time and fail when the doctor presses play.
//
//   npm run storage:check
//
// It writes to a key under a `_healthcheck/` prefix and removes it afterwards.

import { randomBytes } from 'node:crypto';

import { storage } from '../src/core/storage/index.js';

const line = (label: string, value: string) => console.log(`  ${label.padEnd(22)} ${value}`);

const main = async () => {
  const store = storage();

  console.log('\nSTORAGE');
  line('adapter', store.name);
  line('durable', store.durable ? 'yes' : 'NO — uploads are lost on restart');

  if (!store.durable) {
    console.error(
      '\n✖ Still on local disk. STORAGE_S3_BUCKET / _ACCESS_KEY_ID / _SECRET_ACCESS_KEY must all be set.\n' +
        '  Recordings made now will be destroyed by the next deploy.\n'
    );
    process.exit(1);
  }

  // A real payload, not an empty object: some gateways accept a zero-byte PUT
  // and fail on anything with content.
  const payload = randomBytes(64 * 1024);
  const key = `_healthcheck/${Date.now()}-${randomBytes(4).toString('hex')}.bin`;

  console.log('\nROUND TRIP');
  try {
    await store.put(key, payload, 'application/octet-stream');
    line('put', 'ok');
  } catch (err) {
    console.error('\n✖ PUT failed — the credentials cannot write to this bucket.\n', err);
    process.exit(1);
  }

  try {
    const got = await store.get(key);
    if (!got) throw new Error('object not found immediately after writing it');
    if (!got.body.equals(payload)) {
      throw new Error(`bytes differ: wrote ${payload.length}, read ${got.body.length}`);
    }
    line('get', `ok (${got.body.length} bytes, identical)`);
  } catch (err) {
    console.error(
      '\n✖ GET failed. This is the dangerous case: uploads would appear to work and\n' +
        '  playback would fail. Check the key has s3:GetObject on this bucket.\n',
      err
    );
    // Still try to clean up before leaving.
    await store.delete(key).catch(() => undefined);
    process.exit(1);
  }

  try {
    await store.delete(key);
    line('delete', 'ok');
  } catch (err) {
    console.error(
      '\n! DELETE failed. Uploads and playback work, but nothing can ever be removed —\n' +
        '  which blocks the retention job when it lands. Add s3:DeleteObject.\n',
      err
    );
    process.exit(1);
  }

  console.log('\n✔ Storage is durable and working end to end.\n');
};

main().catch((err) => {
  console.error('\n✖ Unexpected failure:', err);
  process.exit(1);
});
