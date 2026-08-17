import { describe, it, expect, vi, beforeEach } from 'vitest';

// Revocation is the answer to "a doctor's laptop was stolen an hour ago". Before
// this the honest answer was "nothing, for up to seven days".

let user: { tokenVersion: number } | null = { tokenVersion: 0 };
let failReads = false;
let updates = 0;

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: async () => {
        if (failReads) throw new Error('db down');
        return user;
      },
      update: async () => {
        updates++;
        user = { tokenVersion: (user?.tokenVersion ?? 0) + 1 };
        return user;
      }
    }
  }
}));

const { tokenVersionValid, revokeAllSessions, clearTokenVersionCache, currentTokenVersion } = await import(
  './session.service.js'
);

beforeEach(() => {
  user = { tokenVersion: 0 };
  failReads = false;
  updates = 0;
  clearTokenVersionCache();
});

describe('token revocation', () => {
  it('treats a token with no version claim as version 0', async () => {
    // Every token issued before this column existed has no claim, and every
    // existing row defaults to 0. Without this the deploy that adds revocation
    // signs every user of every clinic out at once.
    expect(await tokenVersionValid('u1', undefined)).toBe(true);
  });

  it('accepts a token whose version matches', async () => {
    user = { tokenVersion: 3 };
    expect(await tokenVersionValid('u1', 3)).toBe(true);
  });

  it('refuses every token issued before a revocation', async () => {
    user = { tokenVersion: 4 };
    for (const stale of [0, 1, 2, 3, undefined]) {
      clearTokenVersionCache();
      expect(await tokenVersionValid('u1', stale), String(stale)).toBe(false);
    }
  });

  it('refuses a token for an account that no longer exists', async () => {
    // A deleted user's signed token is otherwise valid for the rest of its life.
    user = null;
    expect(await tokenVersionValid('gone', 0)).toBe(false);
  });

  it('does not cache "user not found", so a recreated account works at once', async () => {
    user = null;
    expect(await tokenVersionValid('u1', 0)).toBe(false);
    user = { tokenVersion: 0 };
    expect(await tokenVersionValid('u1', 0)).toBe(true);
  });

  it('allows the request when the database cannot be reached', async () => {
    // Fails OPEN: the alternative is that a brief blip signs every clinic out at
    // once. The token was still validly signed and still expires on its own.
    failReads = true;
    expect(await tokenVersionValid('u1', 0)).toBe(true);
  });

  it('bumping invalidates immediately on the instance that bumped', async () => {
    expect(await tokenVersionValid('u1', 0)).toBe(true); // warms the cache
    const next = await revokeAllSessions('u1');
    expect(next).toBe(1);
    // No cache flush by the test — revokeAllSessions drops its own entry, which
    // is what makes "sign out everywhere" take effect for the caller at once.
    expect(await tokenVersionValid('u1', 0)).toBe(false);
    expect(await tokenVersionValid('u1', 1)).toBe(true);
  });

  it('reads the database once per user per window, not once per request', async () => {
    // The whole reason this is a version integer rather than a sessions table:
    // authorization must not add a query to every API call.
    let reads = 0;
    const spy = vi.spyOn(await import('../../config/prisma.js').then((m) => m.prisma.user), 'findUnique');
    spy.mockImplementation(async () => {
      reads++;
      return user as never;
    });

    await currentTokenVersion('u1');
    await currentTokenVersion('u1');
    await currentTokenVersion('u1');
    expect(reads).toBe(1);
    spy.mockRestore();
  });
});
