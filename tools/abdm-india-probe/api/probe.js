// Does ABDM answer a server hosted in India?
//
// Railway runs in US West, and every call from there to ABDM comes back as a
// CloudFront "403 Request blocked" HTML page — the request never reaches ABDM
// at all. The same call from a laptop in India succeeds. So something between
// us and ABDM refuses that traffic, and the question this answers is WHICH
// something:
//
//   geography      — "nothing from outside India"      → hosting here fixes it
//   the datacentre — "nothing from this cloud/IP range" → hosting here does NOT
//
// Both look identical from outside, which is why guessing is not good enough:
// the answer decides between a free proxy and a paid static-IP machine.
//
// ── Why this needs no credentials ──────────────────────────────────────────
//
// The two outcomes are already distinguishable without authenticating:
//
//   blocked      CloudFront answers 403 with an HTML page — ABDM never sees us
//   not blocked  ABDM answers 401/400 in JSON — it saw us and wanted a token
//
// A 401 is therefore SUCCESS here. Sending no secret also means this endpoint
// stays safe to leave deployed and safe to open in a browser.

/** Where ABDM lives. Two hosts, and either may be filtered independently. */
const TARGETS = [
  {
    name: 'ABHA (enrolment, M1)',
    url: 'https://abhasbx.abdm.gov.in/abha/api/v3/profile/public/certificate',
    method: 'GET'
  },
  {
    name: 'Gateway (sessions, M2)',
    url: 'https://dev.abdm.gov.in/api/hiecm/gateway/v3/sessions',
    method: 'POST'
  }
];

const TIMEOUT_MS = 15_000;

/**
 * One request, reported rather than thrown.
 *
 * Every failure mode is an answer here — a timeout tells us as much as a 403 —
 * so nothing is allowed to escape and end the whole probe early.
 */
const probe = async ({ name, url, method }) => {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? '{}' : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    const contentType = res.headers.get('content-type') ?? '';
    const body = (await res.text()).slice(0, 300).replace(/\s+/g, ' ');

    // CloudFront's block page is HTML and says so in as many words. ABDM's own
    // refusals are JSON. That difference is the entire measurement.
    const blocked = contentType.includes('html') || /Request blocked|could not be satisfied/i.test(body);

    return {
      name,
      url,
      status: res.status,
      contentType,
      reachedAbdm: !blocked,
      verdict: blocked ? 'BLOCKED before reaching ABDM' : 'reached ABDM',
      body,
      ms: Date.now() - started
    };
  } catch (err) {
    return {
      name,
      url,
      status: null,
      reachedAbdm: false,
      verdict: `no answer (${err?.name ?? 'error'}: ${err?.message ?? 'unknown'})`,
      ms: Date.now() - started
    };
  }
};

export default async function handler(_req, res) {
  const results = await Promise.all(TARGETS.map(probe));
  const allReached = results.every((r) => r.reachedAbdm);

  res.status(200).json({
    // Vercel names the region it actually ran in. Worth printing: a function
    // that silently ran somewhere else would make the whole result meaningless.
    ranIn: process.env.VERCEL_REGION ?? 'unknown (not on Vercel?)',
    expectedRegion: 'bom1 (Mumbai)',
    checkedAt: new Date().toISOString(),
    answer: allReached
      ? 'India hosting WORKS — the block is geographic. A Mumbai proxy fixes this.'
      : 'Still blocked from India — the block is not geographic. A static IP whitelisted by NHA is needed.',
    results
  });
}
