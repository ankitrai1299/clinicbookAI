/**
 * P0 regression tests: the booking engine must NEVER offer or accept a past slot.
 *
 * Past slots leaked because "now" was computed in UTC while schedules/slots are
 * clinic-local (Asia/Kolkata): at 15:23 IST (= 09:53 UTC) a 14:00 slot looked
 * "future". These tests pin the behaviour against an INJECTED clock so they are
 * fully deterministic (no dependence on the wall clock).
 *
 *   Run:  npx tsx scripts/testSlotPastFilter.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient({ log: [] });

const { slotIsFuture, isPastSlot, clinicNow, labelToMinutes, getAvailableSlots, BOOKING_BUFFER_MIN } = await import(
  '../src/services/scheduling.service.js'
);

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

// 15:23 IST on 2026-06-24  ==  09:53 UTC (IST = UTC+5:30).
const AT_1523_IST = new Date('2026-06-24T09:53:00.000Z');
const m = (label: string) => labelToMinutes(label)!;

const run = async () => {
  // --- clinicNow resolves to IST, not UTC --------------------------------
  console.log('clinicNow(at) maps a UTC instant to Asia/Kolkata wall-clock:');
  const now = clinicNow(AT_1523_IST);
  ok(now.dateStr === '2026-06-24' && now.minutes === 15 * 60 + 23, `09:53 UTC → ${now.dateStr} ${Math.floor(now.minutes/60)}:${now.minutes%60} IST`);

  // --- The three required tests (now = 3:23 PM) --------------------------
  console.log('\nRequired tests — now = 3:23 PM (15:23) IST, same-day slots:');
  // Test 1: 2:00 PM → hidden
  ok(slotIsFuture(m('02:00 PM'), '2026-06-24', now) === false, 'Test 1: 2:00 PM slot is HIDDEN (past)');
  ok(isPastSlot('2026-06-24', '02:00 PM', AT_1523_IST) === true, 'Test 1: isPastSlot(2:00 PM) === true');
  // Test 2: 4:00 PM → visible
  ok(slotIsFuture(m('04:00 PM'), '2026-06-24', now) === true, 'Test 2: 4:00 PM slot is VISIBLE (future)');
  ok(isPastSlot('2026-06-24', '04:00 PM', AT_1523_IST) === false, 'Test 2: isPastSlot(4:00 PM) === false');
  // Test 3: all remaining slots passed → today unavailable
  const daySlots = ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM'];
  const futureToday = daySlots.filter((s) => slotIsFuture(m(s), '2026-06-24', clinicNow(new Date('2026-06-24T17:30:00.000Z')))); // now = 23:00 IST
  ok(futureToday.length === 0, 'Test 3: at 23:00 IST every 09:00–15:00 slot is gone → today UNAVAILABLE');

  // --- 30-minute booking buffer (P1-1) -----------------------------------
  console.log(`\n30-minute booking buffer (BOOKING_BUFFER_MIN=${BOOKING_BUFFER_MIN}) — now = 3:23 PM:`);
  ok(slotIsFuture(m('03:30 PM'), '2026-06-24', now) === false, 'Buffer: 3:30 PM HIDDEN (only 7 min ahead, < 30)');
  ok(isPastSlot('2026-06-24', '03:30 PM', AT_1523_IST) === true, 'Buffer: cannot BOOK 3:30 PM at 3:23 PM');
  ok(slotIsFuture(m('03:53 PM'), '2026-06-24', now) === true, 'Buffer: exactly +30 min (3:53 PM) is the first bookable');
  ok(slotIsFuture(m('04:00 PM'), '2026-06-24', now) === true, 'Buffer: 4:00 PM shown (matches the spec example)');

  // --- Boundary + future/past day behaviour ------------------------------
  console.log('\nBoundary & date behaviour:');
  ok(slotIsFuture(now.minutes, '2026-06-24', now) === false, 'A slot exactly == now is NOT offered');
  ok(slotIsFuture(m('09:00 AM'), '2026-06-25', now) === true, 'Any slot on a FUTURE date is offered');
  ok(slotIsFuture(m('11:00 PM'), '2026-06-23', now) === false, 'No slot on a PAST date is ever offered');

  // --- Integration: getAvailableSlots with injected clock, real DB -------
  console.log('\nIntegration — getAvailableSlots() never returns a past slot:');
  const clinicId = process.env.WHATSAPP_CLINIC_ID ?? '';
  const doctor = await prisma.doctor.findFirst({ where: clinicId ? { clinicId } : {}, select: { id: true, name: true } });
  if (!doctor) {
    console.log('  (skipped — no doctor in DB)');
  } else {
    // Find a working day in the next 14 days, then set the clock to 13:00 IST on it.
    let tested = false;
    for (let i = 0; i < 14 && !tested; i += 1) {
      const base = clinicNow().dateStr.split('-').map(Number);
      const d = new Date(Date.UTC(base[0], base[1] - 1, base[2] + i));
      const dateStr = d.toISOString().slice(0, 10);
      const at = new Date(`${dateStr}T07:30:00.000Z`); // 13:00 IST on that date
      const slots = await getAvailableSlots(clinicId, doctor.id, dateStr, at);
      if (slots.length === 0) continue; // non-working / fully past → try next day
      const cutoff = clinicNow(at).minutes + BOOKING_BUFFER_MIN; // 13:00 + 30 = 13:30
      const anyTooSoon = slots.some((s) => (labelToMinutes(s) ?? 0) < cutoff);
      ok(!anyTooSoon, `${doctor.name} ${dateStr} @13:00 IST → ${slots.length} slots, earliest ${slots[0]}, none before 13:30 (buffer)`);
      tested = true;
    }
    if (!tested) console.log('  (skipped — no working day with slots found in 14 days)');
  }

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILED'} — ${pass} passed, ${fail} failed`);
};

run()
  .catch((err) => {
    console.error('Test crashed:', err);
    fail++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
