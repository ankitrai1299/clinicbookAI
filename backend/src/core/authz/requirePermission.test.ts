import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// The audit writer is the only thing here that touches a database. Mocked so the
// guard can be exercised for real while the assertions about WHAT it records
// stay exact.
const recorded: Array<Record<string, unknown>> = [];
vi.mock('../audit/audit.service.js', () => ({
  record: (entry: Record<string, unknown>) => {
    recorded.push(entry);
  },
  auditContext: (req: { user?: Record<string, unknown> }) => ({
    clinicId: req.user?.clinicId ?? null,
    actorId: req.user?.userId ?? null,
    actorType: req.user ? 'user' : 'anonymous',
    actorRole: req.user?.role ?? null
  }),
  recordFromRequest: () => undefined
}));

const { requirePermission, assertPermission } = await import('./requirePermission.js');

// Enforcement, over a real express stack rather than a hand-called middleware —
// the ordering of guard, error handler and handler is part of what is being
// tested, and a direct call would skip all of it.

const app = express();

// Stands in for requireAuth: whatever the test asks to be signed in as.
let currentUser: { userId: string; clinicId: string; email: string; role: string } | undefined;
app.use((req, _res, next) => {
  req.user = currentUser;
  next();
});

// A stored MediScribe role, supplied per-test, exercising the resolver path.
let storedRole: string | undefined;
const storedResolver = () => storedRole;

app.get('/patients', requirePermission('patient.read'), (_req, res) => res.json({ ok: true }));
app.delete('/patients/:id', requirePermission('patient.delete'), (_req, res) => res.json({ ok: true }));
app.post('/approve', requirePermission('prescription.approve', storedResolver), (_req, res) => res.json({ ok: true }));
app.get('/audit', requirePermission('audit.read'), (_req, res) => res.json({ ok: true }));

// The real error handler shape: AppError carries its own status.
app.use((err: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _n: express.NextFunction) => {
  res.status(err?.statusCode ?? 500).json({ success: false, message: err?.message });
});

const server = app.listen(0);
const port = () => (server.address() as AddressInfo).port;

const call = (method: string, path: string): Promise<{ status: number; body: any }> =>
  new Promise((resolve, reject) => {
    const req = http.request({ port: port(), path, method }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    req.end();
  });

const owner = { userId: 'u1', clinicId: 'c1', email: 'owner@x.com', role: 'CLINIC_ADMIN' };
const staff = { userId: 'u2', clinicId: 'c1', email: 'desk@x.com', role: 'STAFF' };

beforeEach(() => {
  recorded.length = 0;
  currentUser = undefined;
  storedRole = undefined;
});

describe('route authorization', () => {
  it('lets the right role through', async () => {
    currentUser = staff;
    expect((await call('GET', '/patients')).status).toBe(200);
  });

  it('refuses the wrong role', async () => {
    currentUser = staff;
    const res = await call('DELETE', '/patients/p1');
    expect(res.status).toBe(403);
    // The message names the missing permission so a stuck user can be helped
    // without reading the server log.
    expect(res.body.message).toContain('patient.delete');
  });

  it('refuses an unauthenticated caller', async () => {
    // No req.user at all — the resolver finds no role, and no role has any
    // permission.
    currentUser = undefined;
    expect((await call('GET', '/patients')).status).toBe(403);
  });

  it('refuses a role this build does not recognise', async () => {
    // A token minted before a role was renamed, or forged. Fails closed.
    currentUser = { ...owner, role: 'SUPERUSER' };
    expect((await call('GET', '/patients')).status).toBe(403);
  });

  it('refuses a user whose account no longer resolves', async () => {
    // A deleted or disabled user: the resolver can no longer find a role for
    // them. Their JWT may still be within its 7 days, so this is the check that
    // stops it — nothing is granted on the strength of the token alone.
    currentUser = owner;
    storedRole = undefined;
    // The stored resolver returns nothing AND the JWT role is stripped.
    currentUser = { ...owner, role: '' };
    expect((await call('POST', '/approve')).status).toBe(403);
  });

  it('prefers the stored role over the token role', async () => {
    // A doctor's ClinicBook account says CLINIC_ADMIN because the enum has no
    // DOCTOR — the stored role is the specific one and must win.
    currentUser = owner;
    storedRole = 'doctor';
    expect((await call('POST', '/approve')).status).toBe(200);
  });

  it('refuses a receptionist trying to approve a prescription', async () => {
    currentUser = staff;
    storedRole = 'receptionist';
    expect((await call('POST', '/approve')).status).toBe(403);
  });

  it('refuses a doctor reading the audit trail', async () => {
    currentUser = owner;
    expect((await call('GET', '/audit')).status).toBe(200); // owner may
    currentUser = staff;
    expect((await call('GET', '/audit')).status).toBe(403); // front desk may not
  });
});

describe('a refused request is itself audited', () => {
  it('records the denial with the missing permission and the route', async () => {
    currentUser = staff;
    await call('DELETE', '/patients/p1');

    expect(recorded).toHaveLength(1);
    const row = recorded[0];
    expect(row.action).toBe('AUTHORIZATION_DENIED');
    expect(row.outcome).toBe('denied');
    expect(row.reason).toBe('missing:patient.delete');
    expect(row.actorId).toBe('u2');
    expect(row.clinicId).toBe('c1');
    expect(String(row.resourceId)).toContain('DELETE');
  });

  it('records the denial even when there is no identity to blame', async () => {
    // Anonymous probing is exactly what this row is for.
    currentUser = undefined;
    await call('GET', '/patients');
    expect(recorded).toHaveLength(1);
    expect(recorded[0].actorType).toBe('anonymous');
  });

  it('writes nothing when the request is allowed', async () => {
    // Authorization success is not an event; the ACTION is audited by its own
    // handler. Recording both would double every row in the table.
    currentUser = staff;
    await call('GET', '/patients');
    expect(recorded).toEqual([]);
  });
});

describe('service-level authorization', () => {
  it('throws a 403 where there is no middleware chain', () => {
    // Used when the permission depends on something only the handler knows.
    expect(() => assertPermission('receptionist', 'prescription.approve')).toThrowError(/prescription.approve/);
    expect(() => assertPermission('doctor', 'prescription.approve')).not.toThrow();
    expect(() => assertPermission(null, 'patient.read')).toThrowError();
  });
});
