import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { maskPhone, maskName, maskEmail, describeText } from './redact.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../..');

describe('masking', () => {
  it('leaves enough of a phone number to correlate, and no more', () => {
    // A support request is "a booking failed for the number ending 4686". That
    // has to stay answerable; contacting the person from the log must not.
    expect(maskPhone('+91 79038 84686')).toBe('*4686');
    expect(maskPhone('917903884686')).toBe('*4686');
    expect(maskPhone('123')).toBe('***');
    expect(maskPhone('')).toBe('(none)');
    expect(maskPhone(undefined)).toBe('(none)');
  });

  it('reduces a name to initials, so two patients in one trace stay distinct', () => {
    expect(maskName('Asha Kumari')).toBe('A.K.');
    expect(maskName('  ravi  ')).toBe('R.');
    expect(maskName('')).toBe('(unnamed)');
  });

  it('keeps the domain of an email but not the person', () => {
    expect(maskEmail('apps@nextdot.co.in')).toBe('a***@nextdot.co.in');
    expect(maskEmail('@x.com')).toBe('(redacted)');
    expect(maskEmail('')).toBe('(none)');
  });

  it('describes text by its shape, never its content', () => {
    expect(describeText('chest pain since Tuesday')).toBe('24 chars');
    expect(describeText('')).toBe('empty');
  });
});

// ── The ratchet ─────────────────────────────────────────────────────────────
//
// The gap this closes is not the lines fixed today; it is the next one somebody
// adds. `console.info('...', { phone })` while debugging is a completely natural
// thing to write, it reviews fine, and it quietly puts a patient's number into a
// log store with a different access model and a different retention rule.
//
// So the rule is mechanical: a log call may not receive a value whose NAME says
// it is personal or clinical, unless that value is visibly masked.

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
};

const rel = (abs: string) => path.relative(SRC, abs).split(path.sep).join('/');

/** Identifiers that name personal or clinical content. */
const SENSITIVE = [
  'phone',
  'inboundPhone',
  'patientName',
  'patientPhone',
  'transcript',
  'preview',
  'drug',
  'medicine',
  'diagnosis',
  'symptoms',
  'passwordHash',
  'accessToken'
];

/** A reference that is already masked, or is obviously not the value itself. */
const isSafe = (fragment: string): boolean =>
  /mask(Phone|Name|Email)\s*\(/.test(fragment) ||
  /describe(Text|Medicines)\s*\(/.test(fragment) ||
  /\.length\b/.test(fragment) ||
  /\bchars\b/.test(fragment) ||
  /\bcount\b/.test(fragment);

/**
 * Blank out text that is PROSE rather than a value: the contents of quoted
 * strings, and the literal parts of a template string.
 *
 * Without this, `console.error('…using original transcript:', err)` is flagged
 * for the word "transcript" in its own message — and a rule that cries wolf on
 * an English sentence is a rule people switch off.
 */
const stripProse = (call: string): string =>
  call
    // '…' and "…" entirely.
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    // Inside `…`, keep only the ${…} interpolations.
    .replace(/`(?:[^`\\]|\\.)*`/g, (tpl) => (tpl.match(/\$\{[^}]*\}/g) ?? []).join(' '));

/** Every console.* call in a file, as source text. */
const logCalls = (src: string): string[] => {
  const out: string[] = [];
  const re = /console\.(log|info|warn|error|debug)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < src.length && i < open + 2000; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) {
          out.push(src.slice(m.index, i + 1));
          break;
        }
      }
    }
  }
  return out;
};

describe('no personal or clinical data reaches the application log', () => {
  const files = walk(SRC);

  it('scans a real number of files, so it cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap((f) => logCalls(fs.readFileSync(f, 'utf8'))).length).toBeGreaterThan(50);
  });

  it('never logs a sensitive value unmasked', () => {
    const offences: string[] = [];

    for (const abs of files) {
      const src = fs.readFileSync(abs, 'utf8');
      for (const raw of logCalls(src)) {
        const call = stripProse(raw);
        for (const word of SENSITIVE) {
          // `{ phone }`, `{ phone: x }`, `${phone}`, `${p.phone}` …
          const used = new RegExp(`(\\$\\{[^}]*\\b${word}\\b[^}]*\\}|\\b${word}\\s*[,:}])`).test(call);
          if (!used) continue;

          // Pull out just the fragment mentioning it, so masking elsewhere in a
          // long log line does not excuse an unmasked value here.
          const fragment = call.match(new RegExp(`.{0,60}\\b${word}\\b.{0,60}`))?.[0] ?? call;
          if (isSafe(fragment)) continue;

          offences.push(`${rel(abs)}: ${fragment.replace(/\s+/g, ' ').trim()}`);
        }
      }
    }

    expect(
      offences,
      'These log calls put personal or clinical data into the application log. ' +
        'Mask it (core/observability/redact.ts) or log an id instead:\n  ' + offences.join('\n  ')
    ).toEqual([]);
  });
});
