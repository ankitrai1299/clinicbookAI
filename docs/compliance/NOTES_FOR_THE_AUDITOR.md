# Notes for the auditor

Hand this over with the access credentials, before the audit starts.

Everything in it is a deliberate decision with a reason. Stated up front, each
one is a design choice you can disagree with; discovered during a scan, each one
is a finding that costs a round of re-testing — and NDHM's sandbox guidelines
(§8.1.5(e)–(f)) allow **five iterations** before an application is deemed
rejected and must be filed again.

Prepared 11 September 2026 for Anvaya (Nextdot Digital Solutions Pvt. Ltd.),
ABDM sandbox client `SBXID_070136`.

---

## 1. The ABDM callback endpoints accept unauthenticated POSTs

`POST /api/abdm/*` has no authentication. This is required by the protocol and
is safe by construction, not by oversight.

**Why there is no signature to check.** ABDM's v0.5 gateway does not sign the
requests it makes to a Health Information Provider. There is no shared secret,
no HMAC and no mTLS on this path. A check would have nothing to check against.

**Why an unauthenticated caller learns nothing.** The design is asynchronous:
the answer never travels back down the connection the request arrived on. Every
handler acknowledges with `202` and an empty body, then posts the real answer to
ABDM's gateway. A stranger who POSTs to `/api/abdm/v0.5/care-contexts/discover`
receives `202 {}` whether or not the person exists, whether or not the clinic
exists, and whether or not the request was well-formed. No enumeration is
possible because no response varies.

**What an attacker could do.** Cause us to send a callback to ABDM that nobody
asked for. ABDM discards callbacks with no matching request id.

**Which clinic a call is for** arrives in `X-HIP-ID`, resolved against
`Clinic.hfrId`, which carries a unique constraint. Two clinics cannot share one
facility identity, and the lookup refuses to guess if it ever finds two rows.

This is re-examined before production, where ABDM signs its requests.

---

## 2. Five dependency advisories remain open

`npm audit --omit=dev` reports 5 (2 moderate, 3 high), down from 29. The
remaining five stay open because both fixes npm offers carry more risk than the
advisories do.

### express → qs (moderate, CWE: array-limit bypass)

The fix is express 5, which changes routing, path matching and async error
handling across every route in the application. The advisory concerns query
string parsing; every route here validates its input against a schema before the
handler runs, so a malformed query is rejected before it reaches application
logic.

### prisma → @prisma/config → deepmerge-ts (high, stack exhaustion)

npm's remedy is to move prisma **backwards**, from 6.19 to 6.12 — it reports
this as a major change because it is a downgrade. The advisory is stack
exhaustion when merging recursive object graphs, inside the Prisma CLI's config
loader. That loader reads a configuration file we ship; it is not on the query
path, and no attacker-controlled input reaches it.

A downgraded database client and a rewritten router, taken in the week before an
audit, is how a working production system breaks. We would rather carry both as
stated risk and take them in a planned release.

---

## 3. Hosting is outside India today, and we know it

Audit checklist item 5 requires that "the servers reside in India, and no data
is shared out of India".

At the time of writing the application server runs on Railway in US West. The
database (PostgreSQL, Mumbai) and the ABDM relay (Mumbai) are in India. We
identified this from your own guidelines rather than in an audit, and a
migration to an India region is planned before certification.

**We would value your guidance on one point:** does item 5 require the hosting
*provider* to be an Indian entity, or only that the servers are physically
located in India? The answer changes which platform we move to, and we would
rather ask than migrate twice.

---

## 4. Checklist items that belong to the platform, not to us

Several items in §8.1.5(h) describe a datacentre an operator racks themselves:

- item 1 — firewalls, IDS, high-availability
- item 6 — physical-access logs in *n* locations
- item 7 — servers behind IDS/IPS with host firewalls
- item 14 — deployment over SSH/VPN through a single point
- item 20 — no browsing or mail on production servers
- item 21 — server passwords rotated every *n* months

Anvaya runs on managed platforms. There is no server we log into, no host
firewall of ours to configure, and no server password to rotate: deployment is a
git push, and the platform holds the infrastructure. We can supply the
providers' own compliance attestations. Please tell us which form of evidence
you accept for these.

---

## 5. What we would like from you before we start

1. The **STQC certification/audit checklist** with the exact steps, which
   §8.1.5(h) says STQC issues.
2. The **maximum cost ceiling** for this certification, which §8.1.5(g) says is
   "pre-defined, jointly finalized by MeitY and NDHM".
3. Whether **Milestone 2's functional test cases cover health-information
   transfer**, or whether care-context linking alone satisfies them. Our M2
   linking is complete and demonstrated; the consent-notification and
   data-transfer handlers are not yet built, and this answer decides whether
   they must be finished before testing begins.

---

## What is already in place

Stated so you do not have to discover it:

| | |
| --- | --- |
| Passwords | bcrypt, cost 12 |
| Token lifetime | 12h administrators, 30h general users (Secure App Dev §3.1.2 Req 2) |
| Audit trail | hash-chained; records ip, userAgent, requestId, outcome; successful **and** failed logins |
| Audit retention | 3 years (the document asks for 2) |
| Tenant isolation | every query clinic-scoped at the data layer |
| Transport | HTTPS with HSTS, one year, includeSubDomains |
| Headers | CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy |
| Secrets at rest | AES-256-GCM for clinic WhatsApp tokens and webhook secrets |
| Aadhaar | never stored — encrypted with ABDM's public key, sent, discarded |
| Consent | recorded per purpose against a versioned notice, in the patient's own language |
| Request id | on every request (Secure App Dev §3.1.5 Req 5) |
