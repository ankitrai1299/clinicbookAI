import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

// An app password bypasses the second factor. That is the whole point of it, and
// it is also exactly why the rules around it have to be pinned: the difference
// between "a credential for one device" and "a way past MFA for anyone who finds
// one" is entirely in these checks.

interface Row {
  id: string;
  userId: string;
  clinicId: string;
  name: string;
  hash: string;
  prefix: string;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

const rows: Row[] = [];
let nextId = 1;

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    appPassword: {
      count: async ({ where }: any) =>
        rows.filter((r) => r.userId === where.userId && r.revokedAt === null).length,
      create: async ({ data, select }: any) => {
        const row: Row = {
          id: `ap${nextId++}`,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: new Date(),
          ...data
        };
        rows.push(row);
        return select ? { id: row.id, name: row.name, prefix: row.prefix } : row;
      },
      findUnique: async ({ where }: any) => rows.find((r) => r.hash === where.hash) ?? null,
      // Honours `select`, so the test below is actually checking the service's
      // projection rather than the mock's generosity.
      findMany: async ({ where, select }: any) =>
        rows
          .filter((r) => r.userId === where.userId && r.revokedAt === null)
          .map((r) =>
            select
              ? Object.fromEntries(Object.keys(select).map((k) => [k, (r as Record<string, unknown>)[k]]))
              : r
          ),
      update: async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const hits = rows.filter(
          (r) => r.id === where.id && r.userId === where.userId && r.revokedAt === null
        );
        hits.forEach((r) => Object.assign(r, data));
        return { count: hits.length };
      }
    }
  }
}));

const {
  issueAppPassword,
  resolveAppPassword,
  listAppPasswords,
  revokeAppPassword,
  looksLikeAppPassword,
  APP_PASSWORD_PREFIX,
  MAX_APP_PASSWORDS
} = await import('./appPassword.service.js');

beforeEach(() => {
  rows.length = 0;
  nextId = 1;
});

describe('issuing a device password', () => {
  it('returns the plaintext once and stores only its hash', async () => {
    const issued = await issueAppPassword('u1', 'c1', "Dr Rao's phone");

    expect(issued.plaintext.startsWith(APP_PASSWORD_PREFIX)).toBe(true);
    // 160 bits of randomness — enough that a fast hash is the right choice, and
    // enough that guessing is not a threat model.
    expect(issued.plaintext.length).toBe(APP_PASSWORD_PREFIX.length + 40);

    const stored = rows[0];
    expect(stored.hash).toBe(createHash('sha256').update(issued.plaintext).digest('hex'));
    // The plaintext must not be recoverable from anything we keep.
    expect(JSON.stringify(stored)).not.toContain(issued.plaintext);
  });

  it('shows enough to identify a device without revealing the secret', async () => {
    const issued = await issueAppPassword('u1', 'c1', 'tablet');
    expect(issued.prefix.length).toBeLessThan(issued.plaintext.length);
    expect(issued.plaintext.startsWith(issued.prefix)).toBe(true);
  });

  it('never issues the same one twice', async () => {
    const many = await Promise.all(
      Array.from({ length: 15 }, (_, i) => issueAppPassword(`u${i}`, 'c1', 'device'))
    );
    expect(new Set(many.map((m) => m.plaintext)).size).toBe(15);
  });

  it('caps how many a user may hold, and says what to do about it', async () => {
    for (let i = 0; i < MAX_APP_PASSWORDS; i++) await issueAppPassword('u1', 'c1', `device ${i}`);
    await expect(issueAppPassword('u1', 'c1', 'one too many')).rejects.toThrow(/Revoke one/);
  });
});

describe('resolving one at sign-in', () => {
  it('recognises its own format and ignores everything else', () => {
    expect(looksLikeAppPassword('msk_abc')).toBe(true);
    // An ordinary password must never touch this path at all.
    expect(looksLikeAppPassword('hunter2')).toBe(false);
    expect(looksLikeAppPassword('')).toBe(false);
  });

  it('resolves a valid one to its owner', async () => {
    const issued = await issueAppPassword('u1', 'c1', 'phone');
    expect(await resolveAppPassword(issued.plaintext)).toMatchObject({ userId: 'u1' });
  });

  it('refuses a revoked one', async () => {
    const issued = await issueAppPassword('u1', 'c1', 'lost phone');
    await revokeAppPassword('u1', issued.id);
    expect(await resolveAppPassword(issued.plaintext)).toBeNull();
  });

  it('refuses a value that is not one of ours', async () => {
    expect(await resolveAppPassword('msk_deadbeef')).toBeNull();
    expect(await resolveAppPassword('not an app password')).toBeNull();
  });

  it("names the owner, so sign-in can refuse another account's", async () => {
    // The check that matters: a real, valid app password belonging to user B is
    // not a way into user A's account. loginUser compares this userId with the
    // one the email resolved to; without that comparison, any valid device
    // password would open any account.
    const forB = await issueAppPassword('u2', 'c1', "B's phone");
    const resolved = await resolveAppPassword(forB.plaintext);
    expect(resolved?.userId).toBe('u2');
    expect(resolved?.userId).not.toBe('u1');
  });

  it('stamps when it was last used, so dead devices can be pruned', async () => {
    const issued = await issueAppPassword('u1', 'c1', 'phone');
    await resolveAppPassword(issued.plaintext);
    // Fire-and-forget, so let the microtask queue drain.
    await new Promise((r) => setTimeout(r, 0));
    expect(rows[0].lastUsedAt).toBeInstanceOf(Date);
  });
});

describe('listing and revoking', () => {
  it('never exposes the hash or the plaintext', async () => {
    await issueAppPassword('u1', 'c1', 'phone');
    const list = await listAppPasswords('u1');
    expect(JSON.stringify(list)).not.toContain('hash');
  });

  it('hides revoked devices from the list', async () => {
    const a = await issueAppPassword('u1', 'c1', 'old phone');
    await issueAppPassword('u1', 'c1', 'new phone');
    await revokeAppPassword('u1', a.id);
    expect((await listAppPasswords('u1')).map((r) => r.name)).toEqual(['new phone']);
  });

  it("cannot revoke someone else's device", async () => {
    // An id copied from another account revokes nothing.
    const issued = await issueAppPassword('u2', 'c1', "B's phone");
    expect(await revokeAppPassword('u1', issued.id)).toBe(false);
    expect(await resolveAppPassword(issued.plaintext)).toMatchObject({ userId: 'u2' });
  });

  it('reports whether anything was actually revoked', async () => {
    expect(await revokeAppPassword('u1', 'does-not-exist')).toBe(false);
    const issued = await issueAppPassword('u1', 'c1', 'phone');
    expect(await revokeAppPassword('u1', issued.id)).toBe(true);
    // Revoking twice is not an error, but it is not a second revocation either.
    expect(await revokeAppPassword('u1', issued.id)).toBe(false);
  });
});
