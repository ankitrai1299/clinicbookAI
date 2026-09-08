// The India relay: our backend's ABDM calls, made from Mumbai.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// ABDM refuses traffic from outside India. Not with an error we could read —
// CloudFront turns the request away with a 403 HTML page and ABDM never sees
// it. Our backend runs on Railway in US West, so every ABDM call failed there
// while the identical call from a laptop in Jamshedpur succeeded.
//
// Moving the whole backend to India would be a large change for one API. This
// moves only the calls that need to be Indian, and nothing else.
//
// That the block is GEOGRAPHIC and not per-IP is measured, not assumed: a probe
// deployed to this same region reached both ABDM hosts (401 "Missing
// Credentials" — refused for want of a token, which means it arrived). If it
// had been per-IP this file would be pointless and we would be buying a static
// IP instead.
//
// ── Shape ──────────────────────────────────────────────────────────────────
//
// A prefix picks the ABDM host; everything after it is passed through
// untouched:
//
//   /api/gw/api/hiecm/gateway/v3/sessions  ->  dev.abdm.gov.in/api/hiecm/...
//   /api/abha/abha/api/v3/...              ->  abhasbx.abdm.gov.in/abha/api/...
//
// So the backend needs no new code path — only two base URLs:
//
//   ABDM_GATEWAY_BASE_URL = https://<this-deployment>/api/gw
//   ABDM_ABHA_BASE_URL    = https://<this-deployment>/api/abha
//
// The prefixes are turned into query parameters by the rewrites in vercel.json,
// which is why this is one plainly-named function rather than the catch-all
// `api/[...path].js` it looks like it should be. That catch-all deploys without
// complaint and then answers 404 to everything: dynamic route filenames are a
// framework feature, and this project has no framework.
//
// ── What this can and cannot see ───────────────────────────────────────────
//
// It CANNOT see an Aadhaar number. That is encrypted with ABDM's public key on
// our backend before it is ever sent, so a sealed envelope passes through here.
//
// It CAN see our gateway token and, briefly, a patient's ABHA token, because
// both travel in headers it forwards. They are not stored, logged or inspected
// — but that is exactly why X-Proxy-Key is not optional. An open relay to ABDM
// carrying our credentials is not something to leave lying around.

/** The two ABDM hosts, chosen by the first path segment. */
const UPSTREAM = {
  gw: 'https://dev.abdm.gov.in',
  abha: 'https://abhasbx.abdm.gov.in'
};

/**
 * Headers that must NOT be copied upstream.
 *
 * `host` would send ABDM our own hostname and break TLS/routing; the hop-by-hop
 * ones describe THIS connection and mean nothing on the next one; the platform
 * ones are Vercel's own additions. `accept-encoding` is dropped so the answer
 * arrives uncompressed and can be passed on as text without re-encoding it.
 */
const STRIP = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'accept-encoding',
  'x-proxy-key', // ours, and no business of ABDM's
  'x-real-ip',
  'forwarded'
]);

const isStripped = (name) =>
  STRIP.has(name) || name.startsWith('x-forwarded-') || name.startsWith('x-vercel-');

/** ABDM is occasionally slow; well inside the platform's own ceiling. */
const UPSTREAM_TIMEOUT_MS = 25_000;

export default async function handler(req, res) {
  // ── The gate ─────────────────────────────────────────────────────────────
  //
  // Compared before anything else is read. A missing key on the server is
  // treated as a refusal, never as "no check needed" — a relay that fails OPEN
  // when misconfigured is worse than one that does not work at all.
  const expected = process.env.PROXY_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'Relay is not configured: PROXY_KEY is unset.' });
  }
  if (req.headers['x-proxy-key'] !== expected) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // `upstream` and `p` are put here by the rewrites; everything else in the
  // query belongs to the caller and has to reach ABDM unchanged.
  const { upstream, p, ...callerQuery } = req.query;

  const target = UPSTREAM[upstream];
  if (!target) {
    return res.status(404).json({
      error: `Unknown upstream '${upstream ?? ''}'. Expected one of: ${Object.keys(UPSTREAM).join(', ')}.`
    });
  }

  const path = '/' + String(p ?? '').replace(/^\/+/, '');
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(callerQuery)) {
    for (const one of [].concat(v)) search.append(k, one);
  }
  const query = search.toString();
  const url = `${target}${path}${query ? `?${query}` : ''}`;

  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!isStripped(name.toLowerCase())) headers[name] = value;
  }

  // Vercel has already parsed a JSON body into an object; re-serialise it so
  // what ABDM receives is byte-for-byte what our backend meant to send.
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });

    const text = await upstream.text();
    const type = upstream.headers.get('content-type');
    if (type) res.setHeader('content-type', type);

    // ABDM's status is passed through unchanged, including its errors. The
    // backend already knows how to read those; inventing a status here would
    // hide the one thing it needs.
    return res.status(upstream.status).send(text);
  } catch (err) {
    // A failure to REACH ABDM is ours to report, and must not look like an
    // answer from them.
    return res.status(502).json({
      error: 'The India relay could not reach ABDM.',
      detail: `${err?.name ?? 'Error'}: ${err?.message ?? 'unknown'}`
    });
  }
}
