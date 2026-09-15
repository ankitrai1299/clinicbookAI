/**
 * Is the AI working right now?
 *
 *   npm run ai:check
 *
 * Spends a handful of tokens on a real request and says plainly whether the key
 * can actually be used. Neither provider offers a balance endpoint — Sarvam has
 * no /usage or /credits route, only /v1/models — so a real call is the only
 * honest test, and "the key is set" is not an answer.
 *
 * Worth running whenever transcription, WhatsApp voice notes or the AI
 * receptionist go quiet, because that is exactly what an exhausted balance looks
 * like from the outside: nothing, with no error anywhere.
 */

import '../src/config/env.js';

const { checkAi } = await import('../src/core/ai/ai.diagnostics.js');
const { aiProvider, aiModel } = await import('../src/core/ai/provider.js');

const { ok, detail } = await checkAi();

console.log('');
console.log(`  provider   ${aiProvider()}`);
console.log(`  model      ${aiModel()}`);
console.log(`  status     ${ok ? 'WORKING' : 'NOT WORKING'}`);
console.log(`  detail     ${detail}`);
if (!ok) {
  console.log('');
  console.log('  Every AI feature shares this key: live transcription, the meaning row,');
  console.log('  WhatsApp voice notes, the AI receptionist and the booking intent router.');
  console.log('  Sarvam balance: https://dashboard.sarvam.ai  →  Billing / Usage');
}
console.log('');

process.exitCode = ok ? 0 : 1;
