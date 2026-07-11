/**
 * Verification for the WhatsApp VOICE feature's brain (no real audio needed).
 *
 * The voice path is:  audio → Whisper → TEXT → understand(forceAi) → FSM.
 * Whisper + Graph media-download need a real voice note + webhook, so this
 * script verifies everything FROM the transcript onward — which is the part
 * that decides intent/speciality/date and feeds the FSM:
 *
 *   1. isVoiceAiEnabledFor()  → voice ON for everyone by default ("off" disables)
 *   2. understand({forceAi})  → REAL OpenAI call on the spec's example sentence
 *                               ("Mujhe kal heart doctor dikhana hai")
 *   3. AI-off typed text      → understand() stays deterministic (FSM unchanged)
 *
 * Read-only: it does NOT book, send WhatsApp, or write to the DB.
 *
 *   Run:  npx tsx scripts/testVoiceUnderstanding.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

// Imported AFTER dotenv so env validation (config/env.ts) sees the real values.
const { understand } = await import('../src/modules/whatsapp/whatsapp.receptionist.js');
const { isVoiceAiEnabledFor } = await import('../src/modules/whatsapp/whatsapp.voice.js');

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ ${msg}`);
  }
};

const run = async () => {
  const clinicId = process.env.WHATSAPP_CLINIC_ID ?? '';
  const doctors = await prisma.doctor.findMany({
    where: clinicId ? { clinicId } : {},
    select: { name: true, speciality: true }
  });
  const specialities = [...new Set(doctors.map((d) => d.speciality).filter(Boolean))];
  const doctorNames = doctors.map((d) => d.name);

  console.log(`Clinic: ${clinicId || '(any)'}`);
  console.log(`Specialities: ${specialities.join(', ') || '(none)'}`);
  console.log(`Doctors: ${doctorNames.join(', ') || '(none)'}\n`);

  // --- 1. Voice allowlist: everyone ON by default --------------------------
  console.log('1) Voice enablement (WA_VOICE_TEST_NUMBERS = "%s")', process.env.WA_VOICE_TEST_NUMBERS ?? '');
  ok(isVoiceAiEnabledFor('917903884686'), 'voice enabled for a random sender (default = everyone ON)');

  // --- 2. REAL AI understanding on the spec's example voice sentence -------
  console.log('\n2) AI understanding (forceAi) — the actual voice brain:');
  const examples = [
    { text: 'Mujhe kal heart doctor dikhana hai', want: 'book' },
    { text: 'I want to cancel my appointment', want: 'cancel' },
    { text: 'Can I reschedule to friday?', want: 'reschedule' },
    { text: 'When is my appointment?', want: 'check' }
  ];
  for (const ex of examples) {
    const u = await understand({ message: ex.text, specialities, doctorNames, forceAi: true });
    const detail = `intent=${u.intent} speciality=${u.speciality ?? '-'} date=${u.preferredDate ?? '-'} src=${u.source}`;
    ok(u.intent === ex.want && u.source === 'ai', `"${ex.text}" → ${detail}`);
  }

  // --- 3. Typed text stays deterministic when AI flag is off ---------------
  console.log('\n3) Typed text (no forceAi, WA_AI_RECEPTIONIST off) stays on the FSM classifier:');
  const typed = await understand({ message: 'book cardiologist', specialities, doctorNames });
  ok(typed.source === 'deterministic', `"book cardiologist" → source=${typed.source} (no OpenAI for typed text)`);

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ SOME FAILED'} — ${pass} passed, ${fail} failed`);
};

run()
  .catch((err) => {
    console.error('Verification crashed:', err);
    fail++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
