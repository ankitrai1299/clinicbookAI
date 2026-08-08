import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The module boundary, enforced by the build.
//
// The platform is meant to be a shared core with products sitting ON TOP of it:
//
//     services/     cross-product composition — may use core AND products
//     products/     ClinicBook, MediScribe    — may use core, never each other
//     core/         shared platform services  — may use nothing above it
//     integrations/ external adapters         — register INTO core, never imported by it
//
// That direction is what makes the products sellable apart. A core that imports
// ClinicBook cannot be shipped to a clinic that only bought MediScribe.
//
// This checks TRANSITIVE reach, not just direct imports, because the interesting
// violations hide one hop away: core/whatsapp/whatsapp.booking imports
// services/patientPrescription, which imports products/mediscribe. Nothing in the
// file says "product" — the dependency is real all the same.
//
// KNOWN_VIOLATIONS is a ratchet. It lists what was already broken when the rule
// was introduced so the build can go green today; nothing may be ADDED to it, and
// Phase 2 empties it. A test that starts red is a test people learn to ignore.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = __dirname;

// Every violation present when this rule was written. Each is an edge
// FROM a core/ file TO something that reaches a product.
const KNOWN_VIOLATIONS: ReadonlyArray<[string, string]> = [
  ['core/ai/ai.service.ts', 'products/clinicbook/appointments/appointment.service.ts'],
  ['core/ai/ai.service.ts', 'products/clinicbook/waitlist/waitlist.service.ts'],
  ['core/patients/patient.service.ts', 'products/clinicbook/appointments/appointment.service.ts'],
  ['core/publicapi/v1.routes.ts', 'products/clinicbook/appointments/appointment.service.ts'],
  ['core/publicapi/v1.schemas.ts', 'products/clinicbook/appointments/appointment.port.ts'],
  ['core/whatsapp/whatsapp.booking.ts', 'products/clinicbook/appointments/appointment.service.ts'],
  ['core/whatsapp/whatsapp.booking.ts', 'products/clinicbook/waitlist/waitlist.service.ts'],
  // Indirect: core → services/patientPrescription → products/*.
  ['core/whatsapp/whatsapp.booking.ts', 'services/patientPrescription.service.ts'],
  // MediScribe reads ClinicBook's appointments — the doctor's queue, and closing
  // the appointment when a note is finalized. Both are genuine cross-product
  // features; they belong in services/ or behind a port, not in a direct import.
  ['products/mediscribe/clinicData.ts', 'products/clinicbook/appointments/appointment.service.ts'],
  ['products/mediscribe/appointmentCompletion.ts', 'products/clinicbook/appointments/appointment.service.ts'],
  ['products/mediscribe/router.ts', 'products/clinicbook/appointments/appointment.service.ts'],
];

const isKnown = (from: string, to: string): boolean =>
  KNOWN_VIOLATIONS.some(([f, t]) => f === from && t === to);

// ---- read the source tree -------------------------------------------------

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

// Relative import specifiers only — packages are irrelevant to the boundary.
const importsOf = (abs: string): string[] => {
  const src = fs.readFileSync(abs, 'utf8');
  const specs: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s+['"](\.[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) specs.push(m[1]);
  // Dynamic `await import('./x.js')` counts too — it is still a dependency.
  const dyn = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  while ((m = dyn.exec(src))) specs.push(m[1]);
  return specs;
};

// './foo.js' as written by NodeNext → the .ts file it actually is.
const resolve = (fromAbs: string, spec: string): string | null => {
  const base = path.resolve(path.dirname(fromAbs), spec);
  for (const cand of [
    base.replace(/\.js$/, '.ts'),
    `${base}.ts`,
    path.join(base, 'index.ts'),
    base.replace(/\.js$/, '/index.ts')
  ]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return rel(cand);
  }
  return null;
};

const files = walk(SRC);
const graph = new Map<string, string[]>();
for (const abs of files) {
  graph.set(
    rel(abs),
    importsOf(abs)
      .map((s) => resolve(abs, s))
      .filter((v): v is string => v !== null)
  );
}

// ---- layers ---------------------------------------------------------------

const isProduct = (f: string) => f.startsWith('products/');
const productOf = (f: string) => (isProduct(f) ? f.split('/')[1] : null);
const isCore = (f: string) => f.startsWith('core/');

/** Does this file reach ANY product, directly or through any number of hops? */
const reachCache = new Map<string, string | null>();
const reachesProduct = (file: string, seen = new Set<string>()): string | null => {
  if (isProduct(file)) return file;
  if (reachCache.has(file)) return reachCache.get(file)!;
  if (seen.has(file)) return null;
  seen.add(file);
  for (const dep of graph.get(file) ?? []) {
    const hit = reachesProduct(dep, seen);
    if (hit) {
      reachCache.set(file, hit);
      return hit;
    }
  }
  // Only cache a definitive "no" — a "no" found mid-cycle may be incomplete.
  if (seen.size === 1) reachCache.set(file, null);
  return null;
};

describe('module boundary: core must not depend on a product', () => {
  it('has no core → product dependency beyond the known list', () => {
    // Reported at the ROOT only — the edge where core first leaves core and
    // lands on something product-bound. A core file that is contaminated purely
    // because another core file is gets no report of its own: there is one bug
    // there, not fourteen, and fixing the root fixes them all. (Seven roots
    // currently contaminate fourteen core files this way.)
    const violations: string[] = [];
    for (const [file, deps] of graph) {
      if (!isCore(file)) continue;
      for (const dep of deps) {
        if (isCore(dep)) continue; // internal to core — reported at its own root
        const hit = reachesProduct(dep);
        if (!hit || isKnown(file, dep)) continue;
        violations.push(dep === hit ? `${file} → ${dep}` : `${file} → ${dep} → … → ${hit}`);
      }
    }
    expect(violations, `NEW core → product dependencies:\n  ${violations.join('\n  ')}`).toEqual([]);
  });

  it('every entry in the known list is still real, so the ratchet cannot rust', () => {
    // A stale entry would silently permit a violation that was actually fixed.
    const stale = KNOWN_VIOLATIONS.filter(([f, t]) => !(graph.get(f) ?? []).includes(t));
    expect(stale, `KNOWN_VIOLATIONS entries that no longer exist — delete them:\n  ${stale.map((s) => s.join(' → ')).join('\n  ')}`).toEqual([]);
  });
});

describe('module boundary: products must not depend on each other', () => {
  it('has no product → other-product dependency beyond the known list', () => {
    const violations: string[] = [];
    for (const [file, deps] of graph) {
      const mine = productOf(file);
      if (!mine) continue;
      for (const dep of deps) {
        const theirs = productOf(dep);
        if (!theirs || theirs === mine) continue;
        // novascribe/ holds MediScribe's WhatsApp skills — same product, split
        // for historical reasons, so treat the pair as one.
        const sameFamily = new Set([mine, theirs]).size === 2 &&
          [mine, theirs].every((p) => p === 'mediscribe' || p === 'novascribe');
        if (sameFamily || isKnown(file, dep)) continue;
        violations.push(`${file} → ${dep}`);
      }
    }
    expect(violations, `NEW product → product dependencies:\n  ${violations.join('\n  ')}`).toEqual([]);
  });
});

describe('module boundary: core must not depend on an integration', () => {
  it('keeps integrations plugged IN to core, never imported by it', () => {
    const violations: string[] = [];
    for (const [file, deps] of graph) {
      if (!isCore(file)) continue;
      for (const dep of deps) if (dep.startsWith('integrations/')) violations.push(`${file} → ${dep}`);
    }
    expect(violations, `core → integrations:\n  ${violations.join('\n  ')}`).toEqual([]);
  });
});
