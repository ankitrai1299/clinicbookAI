import { describe, it, expect, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { uploadAudio } from './upload.js';
import { runWithClinic, currentClinicId } from '../context.js';

// The bug this file exists for: recording and uploading audio were the ONLY
// broken screens in the app, and they failed with "[mediscribe] no clinic
// context". Multer calls next() from a request-stream event, and stream events
// run in the async context of the socket — created before any middleware ran —
// so the AsyncLocalStorage store bound by bridgeAuth is gone by the time the
// handler executes. Every non-upload route was unaffected, which is why it took
// a screenshot of a failing upload to find it.
//
// Tested over a real HTTP server rather than fake req/res, because the context
// loss only happens with a genuine socket-backed request stream — a mocked one
// would pass with the bug still present.

const app = express();

// Stands in for bridgeAuth: ClinicBook's requireAuth attaches req.user, the
// bridge binds the store from it.
app.use((req, _res, next) => {
  (req as express.Request & { user?: { clinicId: string } }).user = { clinicId: 'clinic-1' };
  runWithClinic('clinic-1', () => next());
});

const seen = (req: express.Request, res: express.Response) => {
  try {
    // Exactly what a repository call does on the far side of the upload.
    res.json({ clinicId: currentClinicId(), gotFile: !!req.file });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
};

app.post('/with-audio', uploadAudio('audio'), seen);
app.post('/no-body', seen);

const server = app.listen(0);
const port = () => (server.address() as AddressInfo).port;

afterAll(() => server.close());

const BOUNDARY = '----mediscribetest';

const multipartAudio = (): Buffer =>
  Buffer.from(
    `--${BOUNDARY}\r\n` +
      'Content-Disposition: form-data; name="audio"; filename="visit.wav"\r\n' +
      'Content-Type: audio/wav\r\n\r\n' +
      'RIFFfake-audio-bytes\r\n' +
      `--${BOUNDARY}--\r\n`
  );

const post = (path: string, headers: Record<string, string>, body: string | Buffer): Promise<any> =>
  new Promise((resolve, reject) => {
    const req = http.request({ port: port(), path, method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end(body);
  });

describe('audio upload and the tenant context', () => {
  it('still knows the clinic after multer has consumed the request', async () => {
    const body = await post(
      '/with-audio',
      { 'content-type': `multipart/form-data; boundary=${BOUNDARY}`, 'content-length': String(multipartAudio().length) },
      multipartAudio()
    );
    expect(body.error).toBeUndefined();
    expect(body.clinicId).toBe('clinic-1');
  });

  it('still delivers the file itself', async () => {
    // Restoring the context must not cost us what multer was there to do.
    const body = await post(
      '/with-audio',
      { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      multipartAudio()
    );
    expect(body.gotFile).toBe(true);
  });

  it('keeps the context on requests that carry no file at all', async () => {
    // A multipart body with no `audio` part leaves req.file undefined; the
    // handler must still be able to answer (with its own 400), not blow up on
    // a missing store first.
    const empty = Buffer.from(`--${BOUNDARY}--\r\n`);
    const body = await post('/with-audio', { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` }, empty);
    expect(body.clinicId).toBe('clinic-1');
    expect(body.gotFile).toBe(false);
  });

  it('leaves ordinary routes exactly as they were', async () => {
    const body = await post('/no-body', { 'content-type': 'application/json' }, '{}');
    expect(body.clinicId).toBe('clinic-1');
  });
});
