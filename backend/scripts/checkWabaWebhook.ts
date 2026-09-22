/**
 * Is our app subscribed to a WABA's webhooks — and if not, subscribe it.
 *
 * Without that subscription Meta accepts the patient's message and tells us
 * nothing. The number looks perfectly healthy from every other angle: CONNECTED,
 * quality GREEN, token valid, outbound sends fine. Only inbound is silently
 * dead, which reads as "the bot stopped replying" and sends you hunting through
 * the bot code.
 *
 *   WABA_ID=<id> railway run npx tsx scripts/checkWabaWebhook.ts
 *   WABA_ID=<id> COMMIT=yes railway run npx tsx scripts/checkWabaWebhook.ts
 *
 * The token is taken from the clinic's own channel row when one exists for that
 * WABA, otherwise from WHATSAPP_TOKEN. Read-only unless COMMIT=yes.
 *
 * Find the WABA id: developers.facebook.com → your app → WhatsApp → API Setup,
 * where it sits under the phone number as "WhatsApp Business Account ID".
 */
const DB_URL = process.env.DATABASE_URL;
const ENC_KEY = process.env.WA_CHANNEL_ENC_KEY;
const WABA_ID = (process.env.WABA_ID || '').trim();
const COMMIT = process.env.COMMIT === 'yes';

if (!WABA_ID) throw new Error('WABA_ID is required.');
if (!DB_URL) throw new Error('DATABASE_URL is required — run under `railway run`.');

const { PrismaClient } = await import('@prisma/client');
const { deriveKey, decryptSecret } = await import('../src/core/whatsapp/whatsapp.crypto.js');
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const row = await prisma.whatsAppChannel.findFirst({ where: { wabaId: WABA_ID } });
const token = row
  ? decryptSecret(row.accessToken, ENC_KEY ? deriveKey(ENC_KEY) : null)
  : process.env.WHATSAPP_TOKEN;

if (!token) throw new Error(`No channel row for WABA ${WABA_ID} and no WHATSAPP_TOKEN to fall back on.`);
console.log(`\nWABA ${WABA_ID}  (token: ${row ? "that clinic's own channel" : 'WHATSAPP_TOKEN'})`);

const graph = async (path: string, init?: RequestInit) => {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`https://graph.facebook.com/v21.0${path}${sep}access_token=${token}`, init);
  return { ok: res.ok, body: await res.json() };
};

const subs = await graph(`/${WABA_ID}/subscribed_apps`);
if (!subs.ok) {
  console.log('Could not read the subscription:', JSON.stringify(subs.body?.error ?? subs.body));
  await prisma.$disconnect();
  process.exit(1);
}

const apps = subs.body?.data ?? [];
console.log(`Subscribed apps: ${apps.length}`);
for (const a of apps) {
  const d = a.whatsapp_business_api_data ?? {};
  console.log(`  • ${d.name ?? '(unnamed)'}  id ${d.id ?? '?'}  callback ${d.link ?? '-'}`);
}

if (apps.length) {
  console.log('\nInbound should reach us. If it does not, the problem is elsewhere.');
} else if (!COMMIT) {
  console.log('\nNOT SUBSCRIBED — this is why no message from this number ever arrives.');
  console.log('Re-run with COMMIT=yes to subscribe our app to it.');
} else {
  const made = await graph(`/${WABA_ID}/subscribed_apps`, { method: 'POST' });
  console.log(made.ok
    ? '\nSubscribed. Send a message to that number and it should reach us now.'
    : `\nSubscribe failed: ${JSON.stringify(made.body?.error ?? made.body)}`);
}

// Which phone numbers this WABA carries — a cheap way to confirm the id is the
// one you meant before changing anything on it.
const nums = await graph(`/${WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name,status`);
console.log('\nNumbers on this WABA:', JSON.stringify(nums.body?.data ?? nums.body?.error ?? nums.body));

await prisma.$disconnect();
process.exit(0);
