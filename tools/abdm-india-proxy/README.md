# ABDM India relay

Our backend's ABDM calls, made from Mumbai.

## Why

ABDM refuses traffic from outside India. Not with a readable error — CloudFront
turns the request away with a `403` HTML page and ABDM never sees it. Our
backend runs on Railway in **US West**, so every ABDM call failed there while
the identical call from a laptop in India succeeded.

Railway will not change region below its Pro plan, and moving the whole backend
to another host is a large change for the sake of one API. This moves only the
calls that have to be Indian.

That the block is **geographic** and not per-IP was measured before this was
built: a probe deployed to this same region reached both ABDM hosts (`401
Missing Credentials` — refused for want of a token, which means it arrived). Had
it been per-IP, this approach could not work and a static whitelisted IP would
be the only way.

## Shape

The first path segment picks the host; the rest passes through untouched.

```
/api/gw/api/hiecm/gateway/v3/sessions   ->  dev.abdm.gov.in/api/hiecm/...
/api/abha/abha/api/v3/enrollment/...    ->  abhasbx.abdm.gov.in/abha/api/...
```

So the backend needs no new code path — only two different base URLs.

## Deploying

From this directory:

```bash
npx vercel --prod
```

Create a **new project** (not the frontend's). Then set the shared secret on it:

```bash
npx vercel env add PROXY_KEY production
```

and redeploy (`npx vercel --prod`) so the value is picked up.

## Then, on Railway

```
ABDM_GATEWAY_BASE_URL = https://<this-deployment>/api/gw
ABDM_ABHA_BASE_URL    = https://<this-deployment>/api/abha
ABDM_PROXY_KEY        = <the same value as PROXY_KEY>
```

Nothing else changes. `ABDM_PROXY_KEY` travels as `X-Proxy-Key`, added in
`abdmHeaders()` — one place, so every ABDM call carries it.

## Security

**It cannot see an Aadhaar number.** That is encrypted with ABDM's public key on
the backend before it is sent, so only a sealed envelope passes through here.

It **can** see our gateway token, and briefly a patient's ABHA token, since both
travel in forwarded headers. Nothing is stored, logged or inspected — and that
is exactly why `X-Proxy-Key` is required rather than optional. An open relay to
ABDM carrying our credentials is not something to leave lying around.

If `PROXY_KEY` is unset the relay answers `503` and forwards nothing. A relay
that failed open when misconfigured would be worse than one that does not work.

## When this can be removed

The day the backend runs inside India. Then point the two base URLs back at
ABDM, unset `ABDM_PROXY_KEY`, and delete the Vercel project — the backend does
not know this exists and will not notice it going.
