import axios from 'axios';

// Retry + error classification for outbound WhatsApp (Meta Graph API) calls.
//
// Meta failures fall into two buckets:
//   - transient (network blip, HTTP 5xx, 429 rate-limit) — worth retrying;
//   - permanent for this request (4xx, including an expired/invalid access
//     token, code 190) — retrying is pointless and just delays the failure.
// We retry only the first bucket, with exponential backoff.

export interface MetaErrorInfo {
  httpStatus?: number;
  code?: number;
  message?: string;
  type?: string;
}

// Pulls the useful bits out of an axios/Meta error for logging + classification.
export const parseMetaError = (error: unknown): MetaErrorInfo => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: { code?: number; message?: string; type?: string } } | undefined;
    const metaErr = data?.error;
    return {
      httpStatus: error.response?.status,
      code: typeof metaErr?.code === 'number' ? metaErr.code : undefined,
      message: metaErr?.message ?? error.message,
      type: metaErr?.type
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
};

// Meta access-token problems surface as error code 190 (expired/invalid) or an
// HTTP 401. These mean EVERY outbound message will fail until the token is
// replaced — never retry, alert immediately.
export const isTokenExpiredError = (error: unknown): boolean => {
  const { httpStatus, code } = parseMetaError(error);
  return code === 190 || httpStatus === 401;
};

// Retry only transient failures: a network error (no HTTP response at all), an
// HTTP 5xx, or a 429 rate-limit. Token problems and other 4xx are NOT retryable
// (the request would fail identically next time).
export const isRetryableError = (error: unknown): boolean => {
  if (isTokenExpiredError(error)) {
    return false;
  }
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === undefined) {
      return true; // network/timeout — no response received
    }
    if (status === 429) {
      return true; // rate limited — back off and retry
    }
    return status >= 500 && status <= 599;
  }
  return false;
};

export interface RetryOptions {
  attempts?: number; // total attempts including the first (default 3)
  baseDelayMs?: number; // delay before the first retry; doubles each time (default 500)
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  sleep?: (ms: number) => Promise<void>; // injectable so tests don't actually wait
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Runs `fn`, retrying on transient errors with exponential backoff
// (baseDelayMs, 2×, 4× …). Stops early — re-throwing immediately — on a
// non-retryable error (e.g. expired token), and re-throws the last error once
// all attempts are exhausted.
export const withRetry = async <T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> => {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === attempts;
      if (isLastAttempt || !isRetryableError(error)) {
        throw error;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1); // 500, 1000, 2000, …
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
  throw lastError; // unreachable; satisfies the type checker
};
