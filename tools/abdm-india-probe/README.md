# ABDM India probe

One question, answered once: **does ABDM answer a server hosted in India?**

## Why this exists

Every ABDM call from our Railway backend (US West) comes back as a CloudFront
`403 Request blocked` HTML page. The identical call from a laptop in India
succeeds. So the traffic is being refused before it reaches ABDM — but the
refusal does not say why, and there are two very different reasons:

| If the block is on… | Then |
| --- | --- |
| **geography** — nothing from outside India | a Mumbai proxy fixes it, free |
| **the IP range** — nothing from this cloud | we need a static IP that NHA has whitelisted |

Guessing costs either a wasted afternoon building a proxy that cannot work, or
a paid machine we never needed. This tells us which, in about a minute.

## How it answers without any credentials

The two outcomes are already distinguishable unauthenticated:

- **blocked** → CloudFront replies `403` with an HTML page; ABDM never sees us
- **not blocked** → ABDM itself replies `401`/`400` in JSON, asking for a token

So **a 401 here is success.** Nothing secret is sent, which is why this is safe
to deploy and safe to open in a browser.

## Deploying it

It must run in **Mumbai (`bom1`)** — that is the whole point, and `vercel.json`
pins it. Anywhere else and the result means nothing; the response prints the
region it actually ran in so you can check.

From this directory:

```bash
npx vercel --prod
```

Accept the defaults. Vercel prints a URL; open `<url>/api/probe`.

Alternatively, import the repo in the Vercel dashboard as a **new project** and
set **Root Directory** to `tools/abdm-india-probe`. Do not add it to the
existing frontend project — this is a throwaway.

## Reading the result

```jsonc
{
  "ranIn": "bom1",           // must say bom1, or the test proved nothing
  "answer": "…",             // the conclusion, in one line
  "results": [ /* per host */ ]
}
```

`reachedAbdm: true` on both hosts means India hosting works.

## Afterwards

Delete the Vercel project. This answers one question and has no further use;
if the answer was "geographic", the real proxy is a different, deliberate piece
of infrastructure, not this.
