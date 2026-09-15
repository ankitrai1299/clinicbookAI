/**
 * The Anvaya Scribe speech benchmark.
 *
 *   SARVAM_API_KEY=… OPENAI_API_KEY=… npx tsx src/products/mediscribe/benchmark/run.ts
 *   …plus --engines=openai,sarvam,pipeline   (default: all three)
 *   …plus --only=neg-,mix-                   (run a subset by id prefix)
 *   …plus --json=out.json                    (save the run for later comparison)
 *
 * Runs every case through each engine on IDENTICAL audio and prints a table.
 *
 * ── What the three engines are ────────────────────────────────────────────
 *
 *   openai     the realtime model, raw. What the doctor would see with no
 *              correction of any kind.
 *   sarvam     the realtime model TOLD THE RIGHT LANGUAGE. The optimistic
 *              case: it is how Sarvam behaves at its best, and it is not
 *              available in a clinic, where nobody knows what the patient
 *              speaks until they have spoken.
 *   sarvam-hi  the realtime model always told hi-IN. The SHIPPABLE case — what
 *              a doctor would actually get with Sarvam as the primary engine
 *              and no language picker. The gap between this column and the one
 *              above is the price of not knowing the language in advance.
 *   sarvam-auto its own language detection. Measured returning "Doctor, sorry,
 *              sorry, sorry…" on Hindi; in the table so that the reason it is
 *              not used is a number rather than a story.
 *   pipeline   openai, then restoreLatinTerms — what production actually does.
 *
 * The third column is the one that answers "is our work worth anything": it is
 * the same audio and the same model as the first, differing only by what we
 * added. If the pipeline column does not beat the raw column, the pipeline is
 * decoration.
 *
 * ── Honesty about the audio ───────────────────────────────────────────────
 *
 * Synthesised, because no consented recordings exist yet. TTS speech is cleaner
 * than an OPD, so every absolute number is optimistic and none of them should be
 * quoted as "our accuracy". Comparisons between columns and between runs are
 * real, and comparison is what this is for.
 */

import { writeFileSync } from 'node:fs';

import WebSocket from 'ws';

// Loads backend/.env (and .env.local over it) so the keys are found the same way
// the server finds them, rather than requiring them to be typed on the command
// line where a shell history keeps them.
import '../../../config/env.js';

import { CORPUS, type Case } from './corpus.js';
import { score, type Scores } from './metrics.js';

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const ENGINES = (arg('engines') || 'openai,sarvam,pipeline').split(',').map((s) => s.trim());
const ONLY = (arg('only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const JSON_OUT = arg('json');

const sarvamKey = () => (process.env.SARVAM_API_KEY || '').trim();
const openaiKey = () => (process.env.OPENAI_API_KEY || '').trim();

// 24 kHz: what the pipeline captures at, so the benchmark hears what production
// hears. Sarvam is fed the same 3:2 reduction the gateway performs.
const RATE = 24_000;

/** Ticks of trailing silence — 2 s, comfortably past any 600 ms turn detection. */
const TAIL_TICKS = 20;

/**
 * Bytes of PCM16 in a tenth of a second.
 *
 * Two bytes per sample — the factor that was missing first time round, which fed
 * every clip at half speed and returned nothing at all from both providers.
 */
const bytesPer100ms = (rate: number): number => (rate / 10) * 2;

/** Speak a line, and return raw PCM16 at 24 kHz. */
const synthesise = async (text: string, voice: string): Promise<Buffer> => {
  const res = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'api-subscription-key': sarvamKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target_language_code: voice, speech_sample_rate: RATE })
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`TTS ${res.status}: ${body.slice(0, 200)}`);
  const b64 = JSON.parse(body)?.audios?.[0];
  if (!b64) throw new Error('TTS returned no audio');
  // 44-byte RIFF header, then linear16 mono.
  return Buffer.from(b64, 'base64').subarray(44);
};

/** Feed PCM to a socket in real time, then hold for the tail. */
const stream = (
  ws: WebSocket,
  pcm: Buffer,
  frame: (chunk: Buffer) => string,
  bytesPerTick: number
): Promise<void> =>
  new Promise((resolve) => {
    let off = 0;
    let tail = 0;
    const timer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(timer);
        return resolve();
      }
      if (off >= pcm.length) {
        if (tail < TAIL_TICKS) {
          // Paced silence, not one giant frame. A provider's turn detection
          // watches the audio arriving over time; a single 1.2-second blob is
          // not the same thing as 1.2 seconds of quiet.
          tail++;
          ws.send(frame(Buffer.alloc(bytesPerTick)));
          return;
        }
        clearInterval(timer);
        // Trailing silence, and it must be LONGER than the 600 ms of quiet the
        // providers treat as end-of-turn — 600 ms exactly is a pause to them,
        // not an ending, and the last sentence stays inside the provider. The
        // gateway learned this the same way; the constant is 1.2 s there too.
        return resolve();
      }
      ws.send(frame(pcm.subarray(off, off + bytesPerTick)));
      off += bytesPerTick;
    }, 100);
  });

const transcribeOpenAI = (pcm: Buffer): Promise<string> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription', {
      headers: { Authorization: `Bearer ${openaiKey()}` }
    });
    const parts: string[] = [];
    const done = () => resolve(parts.join(' ').trim());
    const timeout = setTimeout(() => {
      ws.close();
      done();
    }, 90_000);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            type: 'transcription',
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: RATE },
                transcription: { model: process.env.OPENAI_LIVE_STT_MODEL || 'gpt-4o-transcribe' },
                turn_detection: { type: 'server_vad', silence_duration_ms: 600 }
              }
            }
          }
        })
      );
      void stream(
        ws,
        pcm,
        (c) => JSON.stringify({ type: 'input_audio_buffer.append', audio: c.toString('base64') }),
        bytesPer100ms(RATE)
      ).then(() => setTimeout(() => ws.close(), 8000));
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'conversation.item.input_audio_transcription.completed' && m.transcript) {
        parts.push(String(m.transcript));
      }
      if (m.type === 'error') reject(new Error(m.error?.message || 'openai error'));
    });
    ws.on('error', reject);
    ws.on('close', () => {
      clearTimeout(timeout);
      done();
    });
  });

/** 24 kHz → 16 kHz, the same averaging the gateway uses. */
const to16k = (pcm: Buffer): Buffer => {
  const groups = Math.floor(pcm.length / 2 / 3);
  const out = Buffer.alloc(groups * 4);
  for (let g = 0; g < groups; g++) {
    const a = pcm.readInt16LE((g * 3) * 2);
    const b = pcm.readInt16LE((g * 3 + 1) * 2);
    const c = pcm.readInt16LE((g * 3 + 2) * 2);
    out.writeInt16LE(Math.round((a * 2 + b) / 3), (g * 2) * 2);
    out.writeInt16LE(Math.round((b + c * 2) / 3), (g * 2 + 1) * 2);
  }
  return out;
};

const transcribeSarvam = (pcm: Buffer, language: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const url =
      'wss://api.sarvam.ai/speech-to-text-realtime/ws?model=saaras%3Av3-realtime&language_code=' +
      encodeURIComponent(language);
    const ws = new WebSocket(url, { headers: { 'api-subscription-key': sarvamKey() } });
    const finals: string[] = [];
    let lastPartial = '';
    const timeout = setTimeout(() => ws.close(), 90_000);

    ws.on('open', () => {
      void stream(
        ws,
        to16k(pcm),
        (c) => JSON.stringify({ event: 'audio_input', audio: c.toString('base64') }),
        bytesPer100ms(16_000)
      ).then(() => setTimeout(() => ws.close(), 8000));
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.event === 'transcript.final' && m.text) finals.push(String(m.text));
      if (m.event === 'transcript.partial') lastPartial = String(m.text ?? '');
    });
    ws.on('error', reject);
    ws.on('close', () => {
      clearTimeout(timeout);
      // A partial with no final still tells us what it heard. Discarding it
      // would score a working engine as silent.
      resolve((finals.length ? finals.join(' ') : lastPartial).trim());
    });
  });

const pct = (v: number | null): string => (v === null ? '  —  ' : `${(v * 100).toFixed(0)}%`.padStart(5));
const werStr = (v: number): string => `${(v * 100).toFixed(0)}%`.padStart(5);

interface Row {
  case: string;
  engine: string;
  text: string;
  scores: Scores;
}

const mean = (xs: Array<number | null>): number | null => {
  const ok = xs.filter((x): x is number => x !== null);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
};

const main = async () => {
  if (!sarvamKey()) throw new Error('SARVAM_API_KEY is required — the audio is synthesised with it.');
  const cases = CORPUS.filter((c) => !ONLY.length || ONLY.some((p) => c.id.startsWith(p)));
  console.log(`\n${cases.length} cases × ${ENGINES.length} engines\n`);
  console.log('Audio is synthesised, so absolute numbers are optimistic.');
  console.log('Read the DIFFERENCES between columns, not the figures themselves.\n');

  const { restoreLatinTerms } = await import('../services/devanagariTerms.js');
  const rows: Row[] = [];

  for (const c of cases) {
    const pcm = await synthesise(c.say, c.voice);
    process.stdout.write(`${c.id.padEnd(20)} `);

    for (const engine of ENGINES) {
      let text = '';
      try {
        if (engine === 'sarvam') {
          text = await transcribeSarvam(pcm, c.voice);
        } else if (engine === 'sarvam-hi') {
          text = await transcribeSarvam(pcm, 'hi-IN');
        } else if (engine === 'sarvam-auto') {
          text = await transcribeSarvam(pcm, 'auto');
        } else if (engine === 'sarvam-pipeline') {
          // Deliberately the SAME language setting as sarvam-auto above. The
          // first version of this ran on hi-IN while the column it was compared
          // against ran on auto, so the two measured different systems and the
          // Bengali row showed the pipeline "destroying" a transcript that the
          // language setting had destroyed before it arrived. A comparison
          // column must differ by exactly one thing.
          text = restoreLatinTerms(await transcribeSarvam(pcm, 'auto'));
        } else {
          const raw = await transcribeOpenAI(pcm);
          text = engine === 'pipeline' ? restoreLatinTerms(raw) : raw;
        }
      } catch (err) {
        text = '';
        process.stdout.write(`[${engine} failed: ${(err as Error).message.slice(0, 40)}] `);
      }
      rows.push({ case: c.id, engine, text, scores: score(c, text) });
      process.stdout.write('.');
    }
    process.stdout.write('\n');
  }

  console.log('\n\n── Per case ────────────────────────────────────────────────────────\n');
  for (const c of cases) {
    console.log(`${c.id}  [${c.tags.join(', ')}]`);
    console.log(`  said     ${c.reference}`);
    for (const engine of ENGINES) {
      const r = rows.find((x) => x.case === c.id && x.engine === engine)!;
      console.log(`  ${engine.padEnd(8)} ${r.text || '(nothing)'}`);
      console.log(
        `           wer ${werStr(r.scores.wer)}   drug ${pct(r.scores.drugAccuracy)}` +
          `   dose ${pct(r.scores.dosageAccuracy)}   neg ${pct(r.scores.negationAccuracy)}`
      );
    }
    console.log('');
  }

  console.log('── Overall ─────────────────────────────────────────────────────────\n');
  console.log('engine      WER    drug   dose    neg');
  for (const engine of ENGINES) {
    const mine = rows.filter((r) => r.engine === engine);
    console.log(
      `${engine.padEnd(10)} ${werStr(mean(mine.map((r) => r.scores.wer)) ?? 0)}  ` +
        `${pct(mean(mine.map((r) => r.scores.drugAccuracy)))}  ` +
        `${pct(mean(mine.map((r) => r.scores.dosageAccuracy)))}  ` +
        `${pct(mean(mine.map((r) => r.scores.negationAccuracy)))}`
    );
  }

  console.log('\n── By tag (WER on code-mix measures SCRIPT, not correctness) ───────\n');
  const tags = [...new Set(cases.flatMap((c) => c.tags))].sort();
  console.log('tag              engine      WER    drug   dose    neg');
  for (const tag of tags) {
    const ids = new Set(cases.filter((c) => c.tags.includes(tag)).map((c) => c.id));
    for (const engine of ENGINES) {
      const mine = rows.filter((r) => r.engine === engine && ids.has(r.case));
      console.log(
        `${tag.padEnd(16)} ${engine.padEnd(10)} ${werStr(mean(mine.map((r) => r.scores.wer)) ?? 0)}  ` +
          `${pct(mean(mine.map((r) => r.scores.drugAccuracy)))}  ` +
          `${pct(mean(mine.map((r) => r.scores.dosageAccuracy)))}  ` +
          `${pct(mean(mine.map((r) => r.scores.negationAccuracy)))}`
      );
    }
  }

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
    console.log(`\nSaved to ${JSON_OUT} — compare against a later run to see whether a change helped.`);
  }
  console.log('');
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
