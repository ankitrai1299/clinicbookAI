/**
 * Pre-flight check for the Meta Embedded Signup setup.
 *
 * Run this BEFORE asking a clinic to click "Connect WhatsApp" — it catches the
 * configuration mistakes that would otherwise only surface as an opaque popup
 * failure half way through onboarding, when a real clinic is already stuck.
 *
 *   npx tsx scripts/checkMetaConfig.ts
 *
 * It verifies:
 *   1. the three platform-level Meta values are present,
 *   2. the app id + secret are a VALID PAIR (proved against Meta, not just
 *      "non-empty" — a copy-paste from the wrong app passes a presence check),
 *   3. tokens can be encrypted at rest (WA_CHANNEL_ENC_KEY),
 *   4. the inbound webhook secrets are set,
 *   5. which clinics would lose WhatsApp under WA_STRICT_CHANNEL.
 *
 * Read-only: it makes one unauthenticated Meta call and one DB count. It never
 * writes, and it never prints a secret.
 */
import axios from 'axios';

import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';

const ok = (m: string) => console.log(`  ✅ ${m}`);
const bad = (m: string) => console.log(`  ❌ ${m}`);
const warn = (m: string) => console.log(`  ⚠️  ${m}`);

let failures = 0;
const fail = (m: string) => {
  failures += 1;
  bad(m);
};

const graph = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;
const metaMsg = (e: unknown): string => {
  const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return err?.response?.data?.error?.message ?? err?.message ?? 'unknown error';
};

const main = async () => {
  console.log('\n── Meta Embedded Signup ─────────────────────────────────');

  const appId = env.META_APP_ID;
  const secret = env.META_APP_SECRET ?? env.WHATSAPP_APP_SECRET;
  const configId = env.META_CONFIG_ID;

  if (!appId) fail('META_APP_ID is not set — the popup cannot launch.');
  if (!secret) fail('META_APP_SECRET is not set — the OAuth code exchange will fail.');
  if (!configId) fail('META_CONFIG_ID is not set — the popup cannot launch.');

  // Presence is not enough: an app id paired with another app's secret passes a
  // presence check and then fails at the code exchange. Ask Meta to mint an app
  // access token — it only succeeds if the pair genuinely belongs together.
  if (appId && secret) {
    try {
      const res = await axios.get(`${graph}/oauth/access_token`, {
        params: { client_id: appId, client_secret: secret, grant_type: 'client_credentials' },
        timeout: 15000
      });
      if (res.data?.access_token) ok(`META_APP_ID + secret are a valid pair (app ${appId}).`);
      else fail('Meta accepted the request but returned no app token — check the app id/secret.');
    } catch (e) {
      fail(`META_APP_ID + META_APP_SECRET rejected by Meta: ${metaMsg(e)}`);
    }
  }

  if (configId) {
    if (/^\d{6,}$/.test(configId)) ok(`META_CONFIG_ID present (${configId}).`);
    else warn(`META_CONFIG_ID "${configId}" does not look like a numeric Meta id — double-check it.`);
  }

  console.log('\n── Token storage ────────────────────────────────────────');
  if (env.WA_CHANNEL_ENC_KEY) {
    ok('WA_CHANNEL_ENC_KEY set — clinic access tokens are encrypted at rest.');
  } else {
    fail(
      'WA_CHANNEL_ENC_KEY is NOT set — every clinic access token would be stored in PLAINTEXT. ' +
        'Set it before the first clinic connects; changing it later forces every clinic to reconnect.'
    );
  }

  console.log('\n── Inbound webhook ──────────────────────────────────────');
  if (env.VERIFY_TOKEN) ok('VERIFY_TOKEN set (GET handshake).');
  else fail('VERIFY_TOKEN is not set — Meta cannot verify the webhook URL.');

  if (env.WHATSAPP_APP_SECRET) {
    ok('WHATSAPP_APP_SECRET set (inbound HMAC).');
  } else if (env.NODE_ENV === 'production') {
    fail('WHATSAPP_APP_SECRET is not set — in production the webhook rejects EVERY inbound message with 503.');
  } else {
    warn('WHATSAPP_APP_SECRET not set — signature check is skipped outside production.');
  }

  const base = env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`;
  console.log(`  ℹ️  Webhook URL to register in the Meta app: ${base}/api/whatsapp/webhook`);

  console.log('\n── Per-clinic channels ──────────────────────────────────');
  const [clinics, channels] = await Promise.all([
    prisma.clinic.findMany({ where: { isSandbox: false }, select: { id: true, name: true } }),
    prisma.whatsAppChannel.findMany({ where: { status: 'ACTIVE' }, select: { clinicId: true } })
  ]);
  const connected = new Set(channels.map((c) => c.clinicId));
  console.log(`  ℹ️  ${clinics.length} clinic(s), ${connected.size} with their own WhatsApp number.`);

  const strict = env.WA_STRICT_CHANNEL;
  const stranded = clinics.filter((c) => !connected.has(c.id) && c.id !== env.WHATSAPP_CLINIC_ID);
  if (strict && stranded.length) {
    warn(
      `WA_STRICT_CHANNEL is ON and ${stranded.length} clinic(s) have no number of their own — ` +
        'they cannot send until they connect one:'
    );
    for (const c of stranded) console.log(`       · ${c.name} (${c.id})`);
  } else if (!strict && stranded.length) {
    console.log(
      `  ℹ️  ${stranded.length} clinic(s) have no number of their own and send from the PLATFORM number ` +
        '(shared-number / join-code tier). That is the intended behaviour while WA_STRICT_CHANNEL is off.'
    );
    for (const c of stranded) console.log(`       · ${c.name} (${c.id})`);
  } else {
    ok('No clinic is relying on the platform number.');
  }

  console.log(
    failures === 0
      ? '\n✅ Ready — a clinic can click "Connect WhatsApp".\n'
      : `\n❌ ${failures} blocker(s) above must be fixed first.\n`
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
};

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
