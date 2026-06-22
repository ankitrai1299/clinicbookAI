/**
 * Offline unit checks for the AI Receptionist layer — NO DB, NO network.
 * Proves:
 *   • parsePreferredDate resolves date phrases deterministically,
 *   • understand() in DETERMINISTIC mode (WA_AI_RECEPTIONIST off) maps the
 *     brief's example phrases to the right intents and stays flag-off-safe
 *     (no date/doctor/FAQ/handoff extras, unknown → confidence 0, silent),
 *   • the interactive reply builders + botReplyText behave.
 *
 *   Run:  npx tsx scripts/testReceptionistLayer.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Force deterministic mode regardless of local .env so this test is hermetic.
process.env.WA_AI_RECEPTIONIST = 'false';
process.env.WA_INTERACTIVE = 'false';

const { parsePreferredDate, matchDoctorName, understand } = await import('../src/modules/whatsapp/whatsapp.receptionist.js');
const { buttons, list, botReplyText, optionId, RID } = await import('../src/modules/whatsapp/whatsapp.reply.js');

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

const todayUTC = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---- parsePreferredDate ----------------------------------------------------
console.log('── parsePreferredDate ──');
check('today', parsePreferredDate('book me in today please') === todayUTC());
check('tomorrow', parsePreferredDate('need a doctor tomorrow') === addDays(1));
check('kal (hindi → tomorrow)', parsePreferredDate('mujhe kal dikhana hai') === addDays(1));
check('day after tomorrow', parsePreferredDate('day after tomorrow works') === addDays(2));
check('ISO date passthrough', parsePreferredDate('on 2099-01-15') === '2099-01-15');
check('garbage → null', parsePreferredDate('i have a headache') === null);
{
  const fri = parsePreferredDate('move it to friday');
  const ok = !!fri && new Date(`${fri}T00:00:00.000Z`).getUTCDay() === 5 && fri >= todayUTC();
  check('weekday "friday" resolves to a Friday on/after today', ok, fri ?? 'null');
}
{
  const d = parsePreferredDate('12 jun');
  const ok = !!d && d.endsWith('-06-12');
  check('"12 jun" → a June 12', ok, d ?? 'null');
}

// ---- matchDoctorName -------------------------------------------------------
console.log('\n── matchDoctorName ──');
const docs = ['Dr. Ruchi Sharma', 'Dr. Amit Verma'];
check('matches by surname', matchDoctorName('is ruchi available today?', docs) === 'Dr. Ruchi Sharma');
check('no match → null', matchDoctorName('i want a skin doctor', docs) === null);

// ---- understand() deterministic mode (flag-off regression) -----------------
console.log('\n── understand() deterministic ──');
const SPECS = ['Cardiology', 'Dermatology', 'Pediatrics'];
const u = async (msg: string) => understand({ message: msg, specialities: SPECS, doctorNames: docs });

{
  const r = await u('I need a heart doctor tomorrow');
  check('heart → book + Cardiology', r.intent === 'book' && r.speciality === 'Cardiology', `${r.intent}/${r.speciality}`);
  check('deterministic: no date extracted (flag-off safe)', r.preferredDate === null && r.source === 'deterministic');
  check('deterministic: no doctor / no handoff (flag-off safe)', r.doctorName === null && r.wantsHuman === false);
}
check('cancel intent (cancel keyword wins, checked first)', (await u('cancel my appointment')).intent === 'cancel');
check('reschedule via "postpone"', (await u('postpone my appointment')).intent === 'reschedule');
check('greeting → menu', (await u('hi')).intent === 'menu');

// Deterministic-mode LIMITATIONS (the reason the AI layer exists): the legacy
// classifier's `book` branch swallows anything containing the word "appointment"
// (it is checked before check/reschedule), and the "reschedule" stem misses the
// full word in some phrasings. The crucial property is that these casual phrases
// still resolve SAFELY — they never misroute to a destructive `cancel`, and an
// unrecognised message stays `unknown` (silent), never an action.
console.log('  (deterministic limitations — AI mode handles these better)');
const SAFE = new Set(['book', 'reschedule', 'check', 'menu', 'unknown']);
for (const phrase of ['move my appointment to friday', 'what appointments do I have?', 'is the doctor free today']) {
  const r = await u(phrase);
  check(`"${phrase}" → safe non-destructive intent (${r.intent})`, SAFE.has(r.intent));
}
{
  const r = await u('asdfghjkl');
  check('garble → unknown + confidence 0 (stays silent path)', r.intent === 'unknown' && r.confidence === 0);
}
check('no FAQ answer in deterministic mode', (await u('what can you do')).faqAnswer === null);

// ---- interactive reply builders -------------------------------------------
console.log('\n── reply builders ──');
{
  const b = buttons({ body: 'Confirm?', buttons: [{ id: RID.CONF_YES, title: '✅ Confirm' }, { id: RID.CHANGE_TIME, title: '🔁 Change time' }] });
  check('buttons kind', b.kind === 'buttons' && b.buttons.length === 2);
  check('botReplyText renders button titles', /Confirm\?/.test(botReplyText(b)) && /\[✅ Confirm\]/.test(botReplyText(b)));
}
{
  const l = list({ body: 'Pick a time', button: 'Pick', rows: [{ id: optionId(1), title: '09:00 AM', description: 'Mon, 1 Jan' }] });
  check('list kind + OPT id', l.kind === 'list' && l.rows[0].id === 'OPT_1');
  check('botReplyText renders rows numbered', /1\. 09:00 AM — Mon, 1 Jan/.test(botReplyText(l)));
}
check('plain string passes through botReplyText', botReplyText('hello') === 'hello');

console.log(`\n──────────────────────────────\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
