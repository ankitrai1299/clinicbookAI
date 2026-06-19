// Unit test for outbound WhatsApp retry/backoff, token-expiry detection, and the
// repeated-failure admin alert (P1-B). No network, no DB — uses an injected
// sleep (so backoff doesn't actually wait) and an injected alert sink.
//
//   npx tsx scripts/test.whatsappRetry.ts
import axios from 'axios';

import { isRetryableError, isTokenExpiredError, withRetry } from '../src/modules/whatsapp/whatsapp.retry.js';
import {
  FAILURE_ALERT_THRESHOLD,
  noteSendFailure,
  noteSendSuccess,
  __resetAlertStateForTest,
  __setAlertSinkForTest,
  type AdminAlert
} from '../src/modules/whatsapp/whatsapp.alerts.js';

let pass = true;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
  if (!ok) pass = false;
};

// Build an axios-shaped error. status=undefined → network error (no response).
const axiosError = (status?: number, metaCode?: number) => {
  const response =
    status === undefined
      ? undefined
      : { status, data: metaCode === undefined ? {} : { error: { code: metaCode, message: 'meta error' } } };
  return new axios.AxiosError('boom', 'ERR', undefined, {}, response as never);
};

const noSleep = async () => {};

const run = async () => {
  // --- 1. Classification --------------------------------------------------
  check('token-expired: Meta code 190 detected', isTokenExpiredError(axiosError(400, 190)));
  check('token-expired: HTTP 401 detected', isTokenExpiredError(axiosError(401)));
  check('token-expired: 500 is NOT a token error', !isTokenExpiredError(axiosError(500)));
  check('retryable: HTTP 503', isRetryableError(axiosError(503)));
  check('retryable: HTTP 429 rate-limit', isRetryableError(axiosError(429)));
  check('retryable: network error (no response)', isRetryableError(axiosError(undefined)));
  check('retryable: HTTP 400 is NOT retryable', !isRetryableError(axiosError(400)));
  check('retryable: token-expired is NOT retryable', !isRetryableError(axiosError(400, 190)));

  // --- 2. Retry then succeed ---------------------------------------------
  {
    let calls = 0;
    const delays: number[] = [];
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw axiosError(503); // fail twice (transient), then succeed
        return 'ok';
      },
      { attempts: 3, baseDelayMs: 500, sleep: async (ms) => { delays.push(ms); }, }
    );
    check('retries transient failures then succeeds', result === 'ok' && calls === 3, `calls=${calls}`);
    check('exponential backoff delays are 500ms, 1000ms', JSON.stringify(delays) === JSON.stringify([500, 1000]), JSON.stringify(delays));
  }

  // --- 3. Exhaust all attempts on persistent failure ----------------------
  {
    let calls = 0;
    let threw = false;
    try {
      await withRetry(async () => { calls += 1; throw axiosError(503); }, { attempts: 3, sleep: noSleep });
    } catch { threw = true; }
    check('persistent transient failure throws after exactly 3 attempts', threw && calls === 3, `calls=${calls}`);
  }

  // --- 4. Token-expired stops immediately (no wasted retries) --------------
  {
    let calls = 0;
    let threw = false;
    try {
      await withRetry(async () => { calls += 1; throw axiosError(401); }, { attempts: 3, sleep: noSleep });
    } catch { threw = true; }
    check('token-expired error is NOT retried (1 attempt only)', threw && calls === 1, `calls=${calls}`);
  }

  // --- 5. Admin alert on repeated failures --------------------------------
  {
    const alerts: AdminAlert[] = [];
    __resetAlertStateForTest();
    __setAlertSinkForTest((a) => alerts.push(a));

    noteSendFailure({ clinicId: 'c1', tokenExpired: false, error: 'e' }); // 1
    noteSendFailure({ clinicId: 'c1', tokenExpired: false, error: 'e' }); // 2
    check(`no alert below threshold (${FAILURE_ALERT_THRESHOLD})`, alerts.length === 0, `alerts=${alerts.length}`);

    noteSendFailure({ clinicId: 'c1', tokenExpired: false, error: 'e' }); // 3 → crosses threshold
    check('alert raised once at threshold', alerts.length === 1 && !alerts[0].critical, `alerts=${alerts.length}`);

    noteSendFailure({ clinicId: 'c1', tokenExpired: false, error: 'e' }); // 4 → no duplicate spam
    check('no duplicate alert while streak continues', alerts.length === 1, `alerts=${alerts.length}`);

    noteSendSuccess(); // streak reset
    noteSendFailure({ clinicId: 'c1', tokenExpired: false, error: 'e' }); // 1 again
    check('success resets the failure streak', alerts.length === 1, `alerts=${alerts.length}`);

    // --- 6. Token-expired alerts immediately, critical ---------------------
    __resetAlertStateForTest();
    alerts.length = 0;
    noteSendFailure({ clinicId: 'c1', tokenExpired: true, error: 'token' }); // first failure
    check('token-expired raises an immediate CRITICAL alert', alerts.length === 1 && alerts[0].critical === true, `alerts=${alerts.length}`);

    __setAlertSinkForTest(null);
  }
};

run()
  .then(() => {
    console.log(pass ? '\nALL ASSERTIONS PASSED' : '\nSOME ASSERTIONS FAILED');
    process.exit(pass ? 0 : 1);
  })
  .catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
