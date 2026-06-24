/**
 * Reminder timing tests: the 1-hour reminder must fire ~1h before the appointment
 * in CLINIC-LOCAL time (Asia/Kolkata). Reminders were previously OFF because the
 * time math treated the stored "HH:MM AM/PM" as UTC, firing ~5.5h off. These
 * tests pin clinicLocalInstant() (IST → true UTC instant) and the window logic.
 *
 *   Run:  npx tsx scripts/testReminderTiming.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { clinicLocalInstant } = await import('../src/services/scheduling.service.js');

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
};

// Mirror of reminder.service's window check (10-min cron window).
const CRON_WINDOW_MS = 10 * 60 * 1000;
const isInReminderWindow = (apptInstant: Date, nowMs: number, targetOffsetMs: number): boolean => {
  const diff = apptInstant.getTime() - nowMs;
  return diff >= targetOffsetMs - CRON_WINDOW_MS && diff < targetOffsetMs + CRON_WINDOW_MS;
};

const utcMidnight = (dateStr: string) => new Date(`${dateStr}T00:00:00.000Z`);
const ONE_HOUR = 60 * 60 * 1000;

const run = async () => {
  // --- IST → UTC instant (the core fix) ----------------------------------
  console.log('clinicLocalInstant maps clinic-local (IST) time to the right UTC instant:');
  ok(clinicLocalInstant(utcMidnight('2026-06-24'), '04:00 PM').toISOString() === '2026-06-24T10:30:00.000Z',
    '4:00 PM IST → 10:30 UTC');
  ok(clinicLocalInstant(utcMidnight('2026-06-24'), '09:00 AM').toISOString() === '2026-06-24T03:30:00.000Z',
    '9:00 AM IST → 03:30 UTC');
  ok(clinicLocalInstant(utcMidnight('2026-06-24'), '12:00 AM').toISOString() === '2026-06-23T18:30:00.000Z',
    'midnight IST → 18:30 UTC previous day');

  // --- 1-hour reminder window --------------------------------------------
  console.log('\n1-hour reminder fires ~1h before (clinic-local):');
  // "Now" = 3:00 PM IST on 2026-06-24 (= 09:30 UTC). Appt 4:00 PM IST is 60 min away.
  const nowMs = clinicLocalInstant(utcMidnight('2026-06-24'), '03:00 PM').getTime();
  const apptSoon = clinicLocalInstant(utcMidnight('2026-06-24'), '04:00 PM');   // +60 min
  const apptFar = clinicLocalInstant(utcMidnight('2026-06-24'), '06:00 PM');    // +180 min
  const apptPast = clinicLocalInstant(utcMidnight('2026-06-24'), '02:00 PM');   // −60 min

  ok(isInReminderWindow(apptSoon, nowMs, ONE_HOUR) === true, 'Appt 60 min away → 1h reminder FIRES');
  ok(isInReminderWindow(apptFar, nowMs, ONE_HOUR) === false, 'Appt 3h away → does NOT fire yet');
  ok(isInReminderWindow(apptPast, nowMs, ONE_HOUR) === false, 'Appt already past → does NOT fire');

  // Sanity: had we (wrongly) treated the time as UTC, the 4 PM appt would look
  // 5.5h further out and the 1h window would MISS it — proving the fix matters.
  const naiveUtc = new Date('2026-06-24T16:00:00.000Z').getTime();
  ok(isInReminderWindow(new Date(naiveUtc), nowMs, ONE_HOUR) === false,
    'Regression guard: UTC-naive 4 PM is NOT in the 1h window (old bug)');

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILED'} — ${pass} passed, ${fail} failed`);
};

run().catch((e) => { console.error(e); fail++; }).finally(() => process.exit(fail === 0 ? 0 : 1));
