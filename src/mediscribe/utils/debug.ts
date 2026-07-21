// Diagnostics for the recording/transcription path.
//
// These traces are genuinely useful when a clinic reports "the recording didn't
// work" — mic device, MIME type, blob size and duration usually identify the
// problem immediately. But they were running unconditionally in production,
// where a doctor's console is not a place to be narrating a consultation.
//
// So they are gated: on in development, and switchable in the field by running
//   localStorage.setItem('mediscribe.debug', '1')
// in the browser console. Nothing that identifies a patient may be passed here —
// a blob URL pointing at consultation audio was one of the things this replaced.

const enabled = (): boolean => {
  try {
    if (import.meta.env?.DEV) return true;
    return localStorage.getItem('mediscribe.debug') === '1';
  } catch {
    return false;
  }
};

export const debug = (...args: unknown[]): void => {
  if (enabled()) console.log(...args);
};
