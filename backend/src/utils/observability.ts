// One place every server-side failure passes through.
//
// Until now a 500 produced `console.error('[error]', err)` — a stack trace with
// nothing around it. On one clinic you can guess the rest; with a hundred, "a
// booking failed this afternoon" is unanswerable without knowing the route, the
// clinic and the request. So errors are logged as a single structured JSON line
// that can be searched and counted, and every request carries an id the clinic
// can quote back.
//
// It is also the seam for a hosted error tracker. Wiring Sentry later means
// implementing one function here — no call sites change, and nothing depends on
// a third-party account today.

import { randomUUID } from 'crypto';

export interface ErrorContext {
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  clinicId?: string;
  userId?: string;
  // Where it came from when there is no request: 'cron:reminders', 'whatsapp:inbound'…
  source?: string;
}

export type ErrorReporter = (error: unknown, context: ErrorContext) => void;

export const newRequestId = (): string => randomUUID();

// PII stays OUT. Ids are enough to find the row; a patient's name, phone or
// message body must never end up in a log line that gets shipped somewhere else.
const describe = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: typeof error, message: String(error) };
};

const consoleReporter: ErrorReporter = (error, context) => {
  const e = describe(error);
  // One line, valid JSON — greppable in Railway and parseable by anything later.
  console.error(
    JSON.stringify({
      level: 'error',
      at: new Date().toISOString(),
      ...context,
      error: { name: e.name, message: e.message }
    })
  );
  // Stack separately so the searchable line stays one line.
  if (e.stack) console.error(e.stack);
};

let reporter: ErrorReporter = consoleReporter;

/** Swap the reporter (Sentry, a test spy). Returns the previous one. */
export const setErrorReporter = (next: ErrorReporter): ErrorReporter => {
  const prev = reporter;
  reporter = next;
  return prev;
};

export const reportError = (error: unknown, context: ErrorContext = {}): void => {
  try {
    reporter(error, context);
  } catch {
    // A failing reporter must never take down the thing it is reporting on.
    console.error('[observability] reporter threw while reporting an error');
  }
};

/**
 * Catch what escapes everything else.
 *
 * This codebase deliberately fires a lot of work off with `void fn().catch()` so
 * a WhatsApp send or a reminder can never fail a request. Anything that slips
 * past one of those catches surfaces as an unhandled rejection — which Node
 * turns into a process exit, i.e. the whole platform restarting with no
 * explanation anywhere. These handlers make that visible instead of silent.
 *
 * An uncaughtException leaves the process in an unknown state, so we log and let
 * the platform restart it rather than pretending it is safe to continue.
 */
export const installProcessErrorHandlers = (onFatal?: () => void): void => {
  process.on('unhandledRejection', (reason) => {
    reportError(reason, { source: 'process:unhandledRejection' });
  });

  process.on('uncaughtException', (error) => {
    reportError(error, { source: 'process:uncaughtException' });
    onFatal?.();
  });
};
