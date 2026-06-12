/**
 * End-to-end check of the new WhatsApp plumbing against the RUNNING server
 * (http://localhost:PORT) and the real DB. Seeds throwaway rows, drives the
 * webhook, asserts the side-effects, then cleans up after itself.
 *
 *   Run (server must be running):  npx tsx scripts/verifyWhatsAppFlow.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';
import dotenv from 'dotenv';

import { prisma } from '../src/config/prisma.js';
import { isConversationWindowOpen } from '../src/modules/whatsapp/whatsapp.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = process.env.PORT ?? '4000';
const WEBHOOK = `http://localhost:${PORT}/api/whatsapp/webhook`;

const suffix = Date.now().toString();
const TEST_PHONE = `1555${suffix.slice(-7)}`;
const TEST_WAMID = `wamid.TEST_${suffix}`;

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const run = async () => {
  // 1) Seed an outbound log row as if we had just sent a template message.
  await prisma.whatsAppLog.create({
    data: {
      to: TEST_PHONE,
      messageType: 'template:appointment_reminder',
      body: '[verify] seeded outbound',
      waMessageId: TEST_WAMID,
      status: 'sent'
    }
  });

  // 2) Drive a delivery-status webhook for that wamid.
  const statusRes = await axios.post(WEBHOOK, {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'ENTRY',
        changes: [
          {
            value: {
              statuses: [
                { id: TEST_WAMID, status: 'delivered', timestamp: '1700000000', recipient_id: TEST_PHONE }
              ]
            }
          }
        ]
      }
    ]
  });
  check('Status webhook returns 200', statusRes.status === 200);
  check('Webhook reports 1 status persisted', statusRes.data?.data?.statusesPersisted === 1,
    `got ${statusRes.data?.data?.statusesPersisted}`);

  const updatedLog = await prisma.whatsAppLog.findFirst({ where: { waMessageId: TEST_WAMID } });
  check('Logged message advanced to delivered', updatedLog?.status === 'delivered',
    `status=${updatedLog?.status}`);

  // 3) Window must be CLOSED before any inbound message.
  const before = await isConversationWindowOpen(TEST_PHONE);
  check('Session window closed before inbound', before === false);

  // 4) Drive an inbound-message webhook from the test number.
  const inboundRes = await axios.post(WEBHOOK, {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'ENTRY',
        changes: [
          {
            value: {
              messages: [
                {
                  from: TEST_PHONE,
                  id: `wamid.IN_${suffix}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: { body: 'Hi, I have a question' }
                }
              ]
            }
          }
        ]
      }
    ]
  });
  check('Inbound webhook returns 200', inboundRes.status === 200);

  const convo = await prisma.whatsAppConversation.findUnique({ where: { phone: TEST_PHONE } });
  check('Conversation row created for inbound number', Boolean(convo));

  // 5) Window must now be OPEN → reminders/notifications would use session text.
  const after = await isConversationWindowOpen(TEST_PHONE);
  check('Session window open after inbound', after === true);

  // Cleanup
  await prisma.whatsAppLog.deleteMany({ where: { waMessageId: TEST_WAMID } });
  await prisma.whatsAppConversation.deleteMany({ where: { phone: TEST_PHONE } });

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(async (err) => {
  console.error('Verification crashed:', err?.message ?? err);
  await prisma.whatsAppLog.deleteMany({ where: { waMessageId: TEST_WAMID } }).catch(() => undefined);
  await prisma.whatsAppConversation.deleteMany({ where: { phone: TEST_PHONE } }).catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
