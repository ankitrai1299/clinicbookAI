// requireScope is the only thing standing between a read-only partner key and a
// booking write, so its failure modes are pinned here rather than left to a
// route-level integration test.
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { requireScope } from './apiKeyAuth.js';
import { AppError } from '../utils/AppError.js';

const run = (apiKey: Request['apiKey']) => {
  const next = vi.fn() as unknown as NextFunction;
  requireScope('write')({ apiKey } as Request, {} as Response, next);
  return next as unknown as ReturnType<typeof vi.fn>;
};

const errorFrom = (next: ReturnType<typeof vi.fn>): AppError => next.mock.calls[0][0] as AppError;

describe('requireScope', () => {
  it('lets a key holding the scope through', () => {
    const next = run({ id: 'k1', clinicId: 'c1', mode: 'LIVE', scopes: ['read', 'write'] });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a read-only key with 403, not 401', () => {
    const next = run({ id: 'k1', clinicId: 'c1', mode: 'LIVE', scopes: ['read'] });
    const err = errorFrom(next);
    // 403 and not 401: the credential is valid and identified — it simply may not
    // do this. A 401 would send the integrator off to re-check their key.
    expect(err.statusCode).toBe(403);
    expect(err.message).toContain('write');
  });

  it('rejects a key with no scopes at all', () => {
    const next = run({ id: 'k1', clinicId: 'c1', mode: 'TEST', scopes: [] });
    expect(errorFrom(next).statusCode).toBe(403);
  });

  it('fails CLOSED when req.apiKey is missing (route mis-wired without requireApiKey)', () => {
    const next = run(undefined);
    expect(errorFrom(next).statusCode).toBe(403);
  });

  it('gates the scope it was asked for, not another one', () => {
    const next = vi.fn() as unknown as NextFunction;
    requireScope('read')({ apiKey: { id: 'k', clinicId: 'c', mode: 'TEST', scopes: ['read'] } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
