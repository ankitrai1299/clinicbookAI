// Speech-to-Text via Sarvam AI.
//
// Replaces the previous OpenAI Whisper integration. Exposes the SAME
// `transcribeAudio(buffer, mimetype, selectedLanguage)` contract the API route
// already calls, so no route/frontend changes are needed.
//
// Sarvam has two STT surfaces with different limits:
//   • Real-time  /speech-to-text            — instant, but audio must be ≤ 30s.
//   • Batch      /speech-to-text/job/v1/…   — async job, handles long audio.
// A full consultation upload is minutes long, so we try the fast sync endpoint
// first and transparently fall back to the batch flow when the audio exceeds the
// 30-second sync limit. Callers get a plain transcript string either way.
//
// The API key is read from the environment (SARVAM_API_KEY) and NEVER logged.

import { sarvamKey, sarvamOrigin } from './sarvam.js';

// Selected language (display name or ISO code) → Sarvam STT language code.
// Sarvam supports these Indian languages + English. Anything unmapped (incl.
// "Auto Detect" and Urdu, which Sarvam STT does not support) → 'unknown', i.e.
// let Sarvam auto-detect the spoken language.
const STT_LANGUAGE_CODES: Record<string, string> = {
  english: 'en-IN', en: 'en-IN',
  hindi: 'hi-IN', hi: 'hi-IN',
  tamil: 'ta-IN', ta: 'ta-IN',
  telugu: 'te-IN', te: 'te-IN',
  bengali: 'bn-IN', bn: 'bn-IN',
  marathi: 'mr-IN', mr: 'mr-IN',
  gujarati: 'gu-IN', gu: 'gu-IN',
  kannada: 'kn-IN', kn: 'kn-IN',
  malayalam: 'ml-IN', ml: 'ml-IN',
  punjabi: 'pa-IN', pa: 'pa-IN',
};

function mapLanguage(selected?: string): string {
  const key = (selected || '').trim().toLowerCase();
  if (!key || key === 'auto' || key === 'auto detect') return 'unknown';
  return STT_LANGUAGE_CODES[key] || 'unknown';
}

// mimetype → file extension used for the batch upload filename. Sarvam infers the
// audio container from the uploaded object, so the extension must reflect it.
// video/mpeg and video/webm are included because Chrome/Windows often labels an
// MP3/WebM audio file with those video/* MIME types.
const MIME_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'video/mpeg': 'mp3',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  'audio/webm': 'webm', 'video/webm': 'webm',
  'audio/ogg': 'ogg', 'audio/opus': 'opus',
  'audio/aac': 'aac', 'audio/flac': 'flac',
};

function extensionFor(mimetype?: string): string {
  const mime = (mimetype || '').toLowerCase().split(';')[0].trim();
  return MIME_EXT[mime] || 'wav';
}

// Normalise the browser-reported MIME to one Sarvam accepts. Sarvam's STT only
// allows audio/* (plus video/webm and application/octet-stream), so a valid MP3
// that Chrome/Windows labels "video/mpeg" must be relabelled as "audio/mpeg"
// before sending — otherwise Sarvam rejects it with 400 "Invalid file type".
// Unknown/empty types fall back to application/octet-stream (Sarvam sniffs the
// container itself), which is in its accepted list.
function sarvamAudioMime(mimetype?: string): string {
  const mime = (mimetype || '').toLowerCase().split(';')[0].trim();
  if (mime === 'video/mpeg') return 'audio/mpeg'; // MP3/MPEG mislabelled by the browser
  if (mime === 'video/webm') return 'audio/webm';
  if (mime.startsWith('audio/')) return mime;
  return 'application/octet-stream';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Recognises Sarvam's "audio too long for the sync API" rejection so we can fall
// back to the batch flow instead of surfacing it as a hard error.
function isDurationLimitError(message: string): boolean {
  return /30\s*second|batch\s*api|duration exceeds/i.test(message || '');
}

/**
 * Transcribe audio with Sarvam. Returns the exact spoken text (transcribed in
 * the language spoken; converting to a selected output language is done later by
 * the translation service — mirroring the previous Whisper behaviour).
 *
 * @param selectedLanguage optional source-language hint (name or code); anything
 *   unmapped / "Auto Detect" lets Sarvam auto-detect.
 */
export async function transcribeAudio(
  buffer: Buffer,
  mimetype: string,
  selectedLanguage?: string,
): Promise<string> {
  const key = sarvamKey();
  if (!key) {
    throw new Error('No transcription API key configured. Set SARVAM_API_KEY in your .env.');
  }

  const languageCode = mapLanguage(selectedLanguage);
  console.log(
    '[sarvam:stt] request — bytes:', buffer.length,
    '| mimetype:', mimetype || 'audio/webm',
    '| language:', languageCode,
  );

  // 1) Fast path: real-time endpoint (≤ 30s of audio).
  try {
    const text = await transcribeSync(buffer, mimetype, languageCode);
    console.log('[sarvam:stt] sync response — text length:', text.length);
    return text;
  } catch (err: any) {
    const detail = err?.detail || err?.message || '';
    if (!isDurationLimitError(detail)) {
      console.error('[sarvam:stt] sync error:', err?.status || '', detail);
      throw err;
    }
    console.log('[sarvam:stt] audio > 30s — falling back to batch API');
  }

  // 2) Long audio: batch job flow.
  const text = await transcribeBatch(buffer, mimetype, languageCode);
  console.log('[sarvam:stt] batch response — text length:', text.length);
  return text;
}

// ── Real-time endpoint ────────────────────────────────────────────────
async function transcribeSync(buffer: Buffer, mimetype: string, languageCode: string): Promise<string> {
  const form = new FormData();
  // Send a Sarvam-accepted audio MIME (browsers mislabel MP3 as video/mpeg) and a
  // Uint8Array body (a plain ArrayBuffer view Blob accepts cleanly).
  const blob = new Blob([new Uint8Array(buffer)], { type: sarvamAudioMime(mimetype) });
  form.append('file', blob, `audio.${extensionFor(mimetype)}`);
  form.append('model', 'saarika:v2.5');
  form.append('language_code', languageCode);

  const res = await fetch(`${sarvamOrigin()}/speech-to-text`, {
    method: 'POST',
    headers: { 'api-subscription-key': sarvamKey() },
    body: form,
  });

  const raw = await res.text();
  if (!res.ok) {
    const message = safeErrorMessage(raw);
    const err: any = new Error(message);
    err.status = res.status;
    err.detail = message;
    throw err;
  }
  return (JSON.parse(raw)?.transcript || '').trim();
}

// ── Batch job flow (long audio) ───────────────────────────────────────
// Async pipeline: init → get upload URL → PUT audio → start → poll → download.
async function transcribeBatch(buffer: Buffer, mimetype: string, languageCode: string): Promise<string> {
  const origin = sarvamOrigin();
  const key = sarvamKey();
  const jsonHeaders = { 'api-subscription-key': key, 'Content-Type': 'application/json' };
  const V = `${origin}/speech-to-text/job/v1`;
  const fileName = `audio.${extensionFor(mimetype)}`;

  // (a) init — saaras:v3 in transcribe mode reliably handles the compressed
  // consultation formats and keeps the transcript in the spoken language.
  const initRes = await fetch(V, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      job_parameters: { model: 'saaras:v3', mode: 'transcribe', language_code: languageCode },
    }),
  });
  if (!initRes.ok) throw batchError('init', await initRes.text());
  const job = (await initRes.json()) as any;
  const jobId = job?.job_id;
  if (!jobId) throw new Error('Sarvam batch init did not return a job id.');
  console.log('[sarvam:stt:batch] job:', jobId);

  // (b) request an upload URL, then PUT the audio to Azure blob storage.
  const upRes = await fetch(`${V}/upload-files`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ job_id: jobId, files: [fileName] }),
  });
  if (!upRes.ok) throw batchError('upload-files', await upRes.text());
  const uploadUrl = ((await upRes.json()) as any)?.upload_urls?.[fileName]?.file_url;
  if (!uploadUrl) throw new Error('Sarvam batch did not return an upload URL.');

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': sarvamAudioMime(mimetype) },
    body: new Uint8Array(buffer),
  });
  if (!putRes.ok) throw new Error(`Sarvam batch upload failed (HTTP ${putRes.status}).`);

  // (c) start the job.
  const startRes = await fetch(`${V}/${jobId}/start`, { method: 'POST', headers: jsonHeaders, body: '{}' });
  if (!startRes.ok) throw batchError('start', await startRes.text());

  // (d) poll status until the job finishes (or times out well under the client's
  // 3-minute request timeout).
  let final: any = null;
  for (let i = 0; i < 60; i++) {
    await sleep(2500);
    const stRes = await fetch(`${V}/${jobId}/status`, { headers: { 'api-subscription-key': key } });
    if (!stRes.ok) continue;
    const status = (await stRes.json()) as any;
    const state = status?.job_state || '';
    if (/Completed/i.test(state)) { final = status; break; }
    if (/Failed/i.test(state)) {
      throw new Error(`Sarvam batch job failed: ${status?.error_message || 'unknown error'}`);
    }
  }
  if (!final) throw new Error('Sarvam batch transcription timed out.');

  // (e) resolve the output file, fetch its download URL and read the transcript.
  const outputName = final?.job_details?.[0]?.outputs?.[0]?.file_name;
  if (!outputName) throw new Error('Sarvam batch job produced no output file.');

  const dlRes = await fetch(`${V}/download-files`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ job_id: jobId, files: [outputName] }),
  });
  if (!dlRes.ok) throw batchError('download-files', await dlRes.text());
  const downloadUrl = ((await dlRes.json()) as any)?.download_urls?.[outputName]?.file_url;
  if (!downloadUrl) throw new Error('Sarvam batch did not return a download URL.');

  const outRes = await fetch(downloadUrl);
  if (!outRes.ok) throw new Error(`Sarvam batch output fetch failed (HTTP ${outRes.status}).`);
  return (((await outRes.json()) as any)?.transcript || '').trim();
}

function safeErrorMessage(raw: string): string {
  try {
    return JSON.parse(raw)?.error?.message || raw;
  } catch {
    return raw;
  }
}

function batchError(stage: string, raw: string): Error {
  return new Error(`Sarvam batch ${stage} failed: ${safeErrorMessage(raw)}`);
}
