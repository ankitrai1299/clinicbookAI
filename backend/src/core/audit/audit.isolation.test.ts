import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { TENANT_MODELS, SCOPED_DESPITE_NULLABLE, scopeArgs } from '../../config/tenantScope.js';

// Two things about the audit trail that cannot be checked by exercising it, only
// by inspecting how it is built:
//
//   1. It must be tenant-scoped. The audit view is the one screen that could
//      leak EVERY clinic at once — one unscoped findMany and a clinic admin is
//      reading another clinic's patient access log.
//
//   2. It must be append-only. That is not enforced by a permission; it is
//      enforced by there being no route that writes, updates or deletes. A test
//      that reads the router source is the only thing that keeps it that way,
//      because adding such a route would otherwise look like a normal feature.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES = path.join(__dirname, 'audit.routes.ts');
const SERVICE = path.join(__dirname, 'audit.service.ts');
const SRC = path.resolve(__dirname, '../..');

describe('audit rows are tenant-scoped', () => {
  it('is registered for scoping at all', () => {
    expect(TENANT_MODELS.has('AuditLog')).toBe(true);
  });

  it('states why it is scoped despite a nullable clinicId', () => {
    // Scoping a nullable column hides the null rows. For AuditLog those are the
    // pre-clinic events (FAILED_LOGIN), and hiding them from tenants is correct
    // — but it has to be a decision, not an accident.
    expect(SCOPED_DESPITE_NULLABLE.AuditLog ?? '').toMatch(/FAILED_LOGIN/);
  });

  it('cannot be pointed at another clinic by a hand-written filter', () => {
    // Clinic A asking for clinic B's audit rows gets clinic A's.
    const out = scopeArgs('AuditLog', 'findMany', { where: { clinicId: 'clinic-b' } }, 'clinic-a');
    expect(out.where).toEqual({ clinicId: 'clinic-a' });
  });

  it('scopes a read that names a patient belonging to another clinic', () => {
    // The realistic attempt: a valid patient id copied from elsewhere.
    const out = scopeArgs('AuditLog', 'findMany', { where: { patientId: 'p-in-clinic-b' } }, 'clinic-a');
    expect(out.where).toEqual({ patientId: 'p-in-clinic-b', clinicId: 'clinic-a' });
  });

  it('scopes a cursor read, which is how the second page is fetched', () => {
    const out = scopeArgs('AuditLog', 'findMany', { where: {}, cursor: { id: 'row-from-clinic-b' } }, 'clinic-a');
    expect(out.where).toEqual({ clinicId: 'clinic-a' });
  });
});

describe('the audit trail is append-only by construction', () => {
  const routes = fs.readFileSync(ROUTES, 'utf8');

  it('defines no route that writes, updates or deletes', () => {
    const writeVerbs = routes.match(/auditRouter\.(post|put|patch|delete)\s*\(/g) ?? [];
    expect(writeVerbs, `audit.routes.ts must expose GET only, found: ${writeVerbs.join(', ')}`).toEqual([]);
  });

  it('gates reading behind a permission', () => {
    expect(routes).toContain("requirePermission('audit.read')");
  });

  it('reads through the tenant-scoped client, never the raw one', () => {
    // req.db is the scoped client. Importing the global prisma here would undo
    // the isolation the scoping test above proves.
    expect(routes).not.toMatch(/from '.*config\/prisma\.js'/);
    expect(routes).toContain('req.db');
  });

  it('has no update or delete anywhere in the audit module', () => {
    const service = fs.readFileSync(SERVICE, 'utf8');
    for (const forbidden of ['auditLog.update', 'auditLog.delete', 'auditLog.upsert']) {
      expect(service, `the writer must only ever create: ${forbidden}`).not.toContain(forbidden);
      expect(routes, `the reader must only ever read: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('is written from exactly one place in the codebase', () => {
    // If another module writes rows directly it bypasses redaction and the hash
    // chain, and neither absence would be visible in a normal review.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === 'dist') continue;
          walk(full, out);
        } else if (e.name.endsWith('.ts') && !e.name.includes('.test.')) out.push(full);
      }
      return out;
    };

    const writers = walk(SRC).filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return /\bauditLog\.create\b/.test(src);
    });

    expect(writers.map((f) => path.relative(SRC, f).split(path.sep).join('/'))).toEqual([
      'core/audit/audit.service.ts'
    ]);
  });
});
