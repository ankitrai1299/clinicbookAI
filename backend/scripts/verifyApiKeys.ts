// Proof harness for TEST keys + sandbox clinics + scopes. Runs against the LOCAL
// dev database (never prod — pass DATABASE_URL/DIRECT_URL explicitly).
//
//   DATABASE_URL='postgresql://postgres@localhost:5432/clinicbook_dev' \
//   DIRECT_URL='postgresql://postgres@localhost:5432/clinicbook_dev' \
//   npx tsx scripts/verifyApiKeys.ts
//
// The load-bearing check is #14: a sandbox clinic must never reach the Graph API.
import '../src/config/env.js';
import { ApiKeyMode } from '@prisma/client';

import { prisma } from '../src/config/prisma.js';
import {
  issueApiKey,
  listApiKeys,
  resolveApiKey,
  revokeApiKey
} from '../src/core/apikeys/apiKey.service.js';
import { clearSandboxCache, ensureSandboxClinic, findSandboxClinic, isSandboxClinic } from '../src/core/apikeys/sandbox.service.js';
import { sendWhatsAppTextMessage, sendWhatsAppInteractive, sendWhatsAppTemplateMessage } from '../src/core/whatsapp/whatsapp.service.js';

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = ''): void => {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}${detail ? `  — ${detail}` : ''}`);
  }
};

const stamp = Date.now();

async function main(): Promise<void> {
  if (/supabase|railway|amazonaws/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('REFUSING TO RUN: DATABASE_URL looks like a remote/production database.');
  }

  const clinic = await prisma.clinic.create({
    data: { name: `KeyTest ${stamp}`, email: `keytest${stamp}@x.test`, phone: `+9199${stamp}`.slice(0, 15) },
    select: { id: true, name: true }
  });

  console.log('\n--- LIVE keys ---');
  const live = await issueApiKey(clinic.id, 'Partner prod');
  check('live key uses ck_live_ prefix', live.plaintext.startsWith('ck_live_'), live.prefix);
  check('live key binds to the REAL clinic', live.clinicId === clinic.id);
  check('live key defaults to both scopes', live.scopes.join(',') === 'read,write', live.scopes.join(','));
  check('stored prefix is a safe display slice', live.prefix.length === 'ck_live_'.length + 6 && live.plaintext.startsWith(live.prefix));

  const resolvedLive = await resolveApiKey(live.plaintext);
  check('live key resolves to its clinic', resolvedLive?.clinicId === clinic.id);
  check('resolve carries mode=LIVE', resolvedLive?.mode === ApiKeyMode.LIVE);
  check('resolve carries scopes', resolvedLive?.scopes.join(',') === 'read,write');

  console.log('\n--- Scopes ---');
  const readOnly = await issueApiKey(clinic.id, 'Read only', { scopes: ['read'] });
  const resolvedRead = await resolveApiKey(readOnly.plaintext);
  check('read-only key resolves with only "read"', resolvedRead?.scopes.join(',') === 'read', resolvedRead?.scopes.join(','));
  check('read-only key cannot write', !resolvedRead?.scopes.includes('write'));

  console.log('\n--- TEST keys + sandbox clinic ---');
  const test = await issueApiKey(clinic.id, 'Partner dev', { mode: ApiKeyMode.TEST });
  check('test key uses ck_test_ prefix', test.plaintext.startsWith('ck_test_'), test.prefix);
  check('test key does NOT bind to the real clinic', test.clinicId !== clinic.id);

  const sandbox = await findSandboxClinic(clinic.id);
  check('sandbox clinic was provisioned', sandbox !== null);
  check('test key binds to the sandbox clinic', test.clinicId === sandbox?.id);
  check('sandbox clinic is flagged', await isSandboxClinic(test.clinicId));
  check('real clinic is NOT flagged', !(await isSandboxClinic(clinic.id)));

  const seeded = await prisma.doctor.findMany({ where: { clinicId: test.clinicId }, select: { id: true, name: true } });
  check('sandbox is seeded with demo doctors', seeded.length === 2, `got ${seeded.length}`);
  const schedules = await prisma.doctorSchedule.count({ where: { clinicId: test.clinicId } });
  check('sandbox doctors have schedules (6 days x 2)', schedules === 12, `got ${schedules}`);

  const realDoctors = await prisma.doctor.count({ where: { clinicId: clinic.id } });
  check('sandbox seed did NOT leak into the real clinic', realDoctors === 0, `got ${realDoctors}`);

  const again = await ensureSandboxClinic(clinic.id);
  check('ensureSandboxClinic is idempotent', again === sandbox?.id);

  const secondTestKey = await issueApiKey(clinic.id, 'Partner dev 2', { mode: ApiKeyMode.TEST });
  check('a second TEST key reuses the same sandbox', secondTestKey.clinicId === sandbox?.id);

  await ensureSandboxClinic(sandbox!.id).then(
    () => check('sandbox of a sandbox is rejected', false, 'it was allowed'),
    () => check('sandbox of a sandbox is rejected', true)
  );

  console.log('\n--- 🚨 WhatsApp suppression (the safety-critical one) ---');
  // No WA_TEST_NO_SEND here: if the guard is missing, resolveSendContext would
  // fall through to the platform's global PHONE_NUMBER_ID and try a real send.
  delete process.env.WA_TEST_NO_SEND;

  const textRes = await sendWhatsAppTextMessage({ to: '+919999999999', message: 'hi', clinicId: test.clinicId });
  check('text send is suppressed for a sandbox clinic', textRes.data.messages?.[0]?.id === 'SANDBOX_text', String(textRes.data.messages?.[0]?.id));

  const interactiveRes = await sendWhatsAppInteractive({
    to: '+919999999999',
    reply: { text: 'pick', buttons: [{ id: 'a', title: 'A' }] } as never,
    clinicId: test.clinicId
  });
  check('interactive send is suppressed for a sandbox clinic', interactiveRes.data.messages?.[0]?.id === 'SANDBOX_interactive');

  const templateRes = await sendWhatsAppTemplateMessage({
    to: '+919999999999',
    templateName: 'appointment_reminder' as never,
    bodyForLog: 'reminder',
    clinicId: test.clinicId
  });
  check('template send is suppressed (this is the reminder-cron path)', templateRes.data.messages?.[0]?.id === 'SANDBOX_template');

  check('no WhatsAppLog rows were written for the sandbox', (await prisma.whatsAppLog.count({ where: { clinicId: test.clinicId } })) === 0);

  clearSandboxCache();
  check('a null clinicId is never treated as a sandbox', !(await isSandboxClinic(null)));
  check('an unknown clinicId is never treated as a sandbox', !(await isSandboxClinic('does-not-exist')));

  console.log('\n--- Listing + revocation ---');
  const keys = await listApiKeys(clinic.id);
  check('list shows LIVE and TEST keys together', keys.length === 4, `got ${keys.length}`);
  check('list never exposes a hash or plaintext', !JSON.stringify(keys).includes(live.plaintext) && !JSON.stringify(keys).includes('keyHash'));
  check('list carries mode + scopes for the UI', keys.every((k) => k.mode && Array.isArray(k.scopes)));

  await revokeApiKey(clinic.id, test.id);
  check('a revoked TEST key stops resolving', (await resolveApiKey(test.plaintext)) === null);
  check('revoking the TEST key left the LIVE key alone', (await resolveApiKey(live.plaintext)) !== null);

  const other = await prisma.clinic.create({
    data: { name: `Other ${stamp}`, email: `other${stamp}@x.test`, phone: `+9188${stamp}`.slice(0, 15) },
    select: { id: true }
  });
  await revokeApiKey(other.id, live.id).then(
    () => check('another clinic cannot revoke our key', false, 'it succeeded'),
    (e: Error) => check('another clinic cannot revoke our key', e.message.includes('not found'))
  );
  check('…and our key still works after that attempt', (await resolveApiKey(live.plaintext)) !== null);

  check('a garbage key resolves to null', (await resolveApiKey('not_a_key_at_all')) === null);
  check('a well-formed but unknown key resolves to null', (await resolveApiKey('ck_live_' + 'x'.repeat(32))) === null);

  // Cleanup: sandbox cascades from the real clinic via sandboxOfId onDelete: Cascade.
  await prisma.apiKey.deleteMany({ where: { clinicId: { in: [clinic.id, sandbox!.id] } } });
  await prisma.doctorSchedule.deleteMany({ where: { clinicId: sandbox!.id } });
  await prisma.doctor.deleteMany({ where: { clinicId: sandbox!.id } });
  await prisma.clinic.delete({ where: { id: sandbox!.id } });
  await prisma.clinic.deleteMany({ where: { id: { in: [clinic.id, other.id] } } });

  console.log(`\n===== ${pass} passed, ${fail} failed =====\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nHARNESS ERROR:', err);
  await prisma.$disconnect();
  process.exit(1);
});
