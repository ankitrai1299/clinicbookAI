// The socket a doctor's microphone talks to.
//
// Everything else in this API is request/response: ask, get an answer, done. A
// consultation is not that shape. Audio arrives continuously for twenty minutes
// and words come back while it is still arriving, so this is the one place that
// keeps a line open in both directions.
//
// ── Why the relay exists at all ───────────────────────────────────────────
//
// The phone could talk to OpenAI directly and save a hop. It would also have to
// hold our OpenAI key, on a device we do not control, extractable from the APK
// by anyone who cares to look — and that key bills us. So the key stays here and
// the audio passes through.
//
// It buys two more things. The provider can be changed without shipping an app,
// which matters because the choice between OpenAI and Sarvam was made by
// measurement and measurements change. And every clinic's audio can be held to
// the same limits, rather than trusting each client to behave.

import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';

import { WebSocketServer, type WebSocket } from 'ws';

import { verifyAccessToken } from '../../config/jwt.js';
import { tokenVersionValid } from '../../core/auth/session.service.js';
import { openLiveStt, availableProviders, type LiveSttSession } from './services/liveStt/index.js';
import { restoreLatinTerms } from './services/devanagariTerms.js';

export const LIVE_STT_PATH = '/api/mediscribe/stt/stream';

/** A consultation is long; an abandoned socket is forever. */
const MAX_SESSION_MS = 90 * 60 * 1000; // 90 minutes
/** ~1 s of 24 kHz mono PCM16. A frame larger than this is not a microphone. */
const MAX_FRAME_BYTES = 96_000;

interface Principal {
  userId: string;
  clinicId: string;
}

/**
 * Who is on the other end.
 *
 * The token travels in the query string, and that is not laziness: a browser's
 * WebSocket constructor cannot set an Authorization header. It is the only way
 * in from a web client, so the cost is paid deliberately and contained — the URL
 * is never logged here, and the first thing done with it is to throw it away.
 *
 * Same three checks as `requireAuth`, and deliberately not a looser set: a
 * signature, a revocation version, and a refusal of half-authenticated MFA
 * tokens. A live microphone is not a lesser resource than a JSON endpoint.
 */
const authenticate = async (url: string): Promise<Principal | null> => {
  let token = '';
  try {
    token = new URL(url, 'http://localhost').searchParams.get('token')?.trim() ?? '';
  } catch {
    return null;
  }
  if (!token) return null;

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return null;
  }
  if (payload.scope === 'mfa') return null;
  if (!(await tokenVersionValid(payload.userId, payload.tv))) return null;
  if (!payload.clinicId) return null;

  return { userId: payload.userId, clinicId: payload.clinicId };
};

const say = (ws: WebSocket, msg: Record<string, unknown>): void => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
};

export const attachLiveSttGateway = (server: Server): void => {
  if (!availableProviders().length) {
    console.warn(
      `[liveStt] ${LIVE_STT_PATH} not mounted: neither OPENAI_API_KEY nor SARVAM_API_KEY is set.`
    );
    return;
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  server.on('upgrade', (req, socket: Duplex, head) => {
    // Only ours. Other paths are left alone so a second gateway can be added
    // later without the two fighting over the same event.
    const path = (req.url || '').split('?')[0];
    if (path !== LIVE_STT_PATH) return;

    void authenticate(req.url || '').then((who) => {
      if (!who) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => handle(ws, who));
    });
  });

  console.info(`[liveStt] listening on ${LIVE_STT_PATH} — providers: ${availableProviders().join(', ')}`);
};

const handle = (ws: WebSocket, who: Principal): void => {
  let session: LiveSttSession | null = null;
  let bytes = 0;

  // A socket that is opened and then forgotten holds an upstream session open
  // and bills for it. Consultations end; sockets sometimes do not.
  const deadline = setTimeout(() => {
    say(ws, { type: 'error', message: 'Recording session timed out.' });
    ws.close();
  }, MAX_SESSION_MS);

  const stop = () => {
    clearTimeout(deadline);
    session?.close();
    session = null;
  };

  const begin = (languageHint?: string) => {
    if (session) return;
    try {
      session = openLiveStt(
        {
          onOpen: () => say(ws, { type: 'ready', provider: session?.provider }),
          onEvent: (e) =>
            say(ws, {
              type: e.final ? 'final' : 'partial',
              // Drug and test names go back into Latin, but only on a FINISHED
              // line. A partial is half a word — "पैराs" matches nothing, and a
              // name that rewrote itself twice while the doctor watched would
              // look like the transcript was arguing with itself.
              text: e.final ? restoreLatinTerms(e.text) : e.text,
              language: e.language
            }),
          onError: (err) => {
            console.error(`[liveStt] clinic ${who.clinicId}:`, err.message);
            // The message is ours, not the provider's. A vendor error string on a
            // doctor's screen mid-consultation is noise they cannot act on, and
            // it can carry internals we did not choose to publish.
            say(ws, { type: 'error', message: 'Live transcription stopped. The recording is still being saved.' });
          }
        },
        { languageHint }
      );
    } catch (err) {
      say(ws, { type: 'error', message: (err as Error).message });
      ws.close();
    }
  };

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      if (!session) begin();
      const buf = data as Buffer;
      bytes += buf.length;
      session?.sendAudio(buf);
      return;
    }

    let msg: { type?: string; language?: string };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    // `start` is optional — audio alone opens a session. It exists so a client
    // that knows the language (a doctor who set it) can say so before speaking,
    // which is the difference between Sarvam being useful and being useless.
    if (msg.type === 'start') return begin(msg.language);
    if (msg.type === 'stop') {
      stop();
      say(ws, { type: 'stopped' });
    }
  });

  ws.on('close', () => {
    stop();
    console.info(
      `[liveStt] clinic ${who.clinicId} session closed — ${(bytes / 48_000).toFixed(0)}s of audio`
    );
  });
  ws.on('error', stop);
};
