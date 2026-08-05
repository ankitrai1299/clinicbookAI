import { describe, it, expect, vi, afterEach } from 'vitest';

import { reportError, setErrorReporter, newRequestId, type ErrorContext } from './observability';

const capture = () => {
  const calls: Array<{ error: unknown; context: ErrorContext }> = [];
  const prev = setErrorReporter((error, context) => calls.push({ error, context }));
  return { calls, restore: () => setErrorReporter(prev) };
};

describe('newRequestId', () => {
  it('is unique per call', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newRequestId()));
    expect(ids.size).toBe(500);
  });
});

describe('reportError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes the error and its context to the reporter', () => {
    const { calls, restore } = capture();
    const err = new Error('boom');
    reportError(err, { requestId: 'r1', path: '/api/appointments', clinicId: 'c1', statusCode: 500 });
    expect(calls).toHaveLength(1);
    expect(calls[0].error).toBe(err);
    expect(calls[0].context).toMatchObject({ requestId: 'r1', clinicId: 'c1', statusCode: 500 });
    restore();
  });

  it('never throws when the reporter itself fails', () => {
    // The reporter is the LAST thing standing between a failure and silence. If
    // it can take the request down with it, an outage in the error tracker
    // becomes an outage in the platform.
    const prev = setErrorReporter(() => {
      throw new Error('reporter is down');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => reportError(new Error('original'))).not.toThrow();
    expect(spy).toHaveBeenCalled();
    setErrorReporter(prev);
  });

  it('works with no context at all', () => {
    const { calls, restore } = capture();
    reportError(new Error('x'));
    expect(calls[0].context).toEqual({});
    restore();
  });

  it('handles a non-Error rejection value', () => {
    // `void promise.catch()` can surface a string or undefined, not just Errors.
    const { calls, restore } = capture();
    reportError('just a string', { source: 'process:unhandledRejection' });
    expect(calls[0].error).toBe('just a string');
    restore();
  });
});

describe('the default console reporter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emits ONE parseable JSON line carrying the context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reportError(new Error('kaboom'), { requestId: 'r9', path: '/api/x', clinicId: 'c1', statusCode: 500 });

    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line); // must not throw — this is the searchable line
    expect(parsed).toMatchObject({
      level: 'error',
      requestId: 'r9',
      path: '/api/x',
      clinicId: 'c1',
      statusCode: 500,
      error: { message: 'kaboom' }
    });
  });

  it('logs the stack SEPARATELY so the JSON line stays one line', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reportError(new Error('kaboom'), {});
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect((spy.mock.calls[0][0] as string).includes('\n')).toBe(false);
  });

  it('carries no patient data beyond the ids it was given', () => {
    // Logs get shipped to third parties. A phone number or a patient name must
    // never ride along just because it happened to be on the request.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reportError(new Error('failed'), { requestId: 'r1', path: '/api/patients', clinicId: 'c1' });
    const line = spy.mock.calls[0][0] as string;
    expect(Object.keys(JSON.parse(line)).sort()).toEqual(
      ['at', 'clinicId', 'error', 'level', 'path', 'requestId'].sort()
    );
  });
});
