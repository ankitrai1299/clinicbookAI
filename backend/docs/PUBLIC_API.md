# ClinicBook AI — Public API v1

Booking, reminders and WhatsApp, as an API. Put a key in your environment and call
us: your patients, your dashboard, your data stay where they are.

- **Base URL** — `https://<your-clinicbook-host>/api/v1`
- **Auth** — `Authorization: Bearer ck_live_…` (or `X-API-Key: ck_live_…`)
- **Content type** — `application/json`
- **Responses** — `{ "success": true, "data": … }` · errors `{ "success": false, "message": "…" }`
- **Rate limit** — 600 requests / minute **per API key** (`RateLimit-*` headers on every response)

Your key identifies your clinic. Every request is scoped to it; you cannot read or
write another clinic's data, and you never handle our internal ids for anything
except the appointment id we hand back.

### Test vs live keys

| prefix | acts on | WhatsApp |
|---|---|---|
| `ck_test_…` | a private **sandbox clinic**, pre-seeded with demo doctors | **never sent** |
| `ck_live_…` | the real clinic | real messages to real patients |

**Build against a test key.** A sandbox clinic is a genuinely separate clinic in
our system, so its doctors, patients and appointments are its own — nothing you do
there can touch production data, and no confirmation or reminder can reach a real
phone. Webhooks *do* fire for a sandbox clinic, so the full round trip is testable.

`GET /me` echoes back the key's `mode` and `scopes`. If you are ever unsure which
world you are in, call it.

### Scopes

A key carries `read`, `write`, or both.

| scope | unlocks |
|---|---|
| `read` | `GET /me`, `GET /doctors`, `GET /doctors/:id/slots`, `GET /appointments/:id` |
| `write` | `POST /appointments`, `PATCH /appointments/:id` |

Calling an endpoint without its scope returns **`403`** — not `401`. The key is
valid and identified; it simply may not do that. A website that only *displays*
available slots should hold a read-only key.

Keys are created in the clinic dashboard under **Developers &amp; API**.

> **Where does the doctor/slot data come from?**
> Wherever you keep it. If your clinic runs on our system, from our database. If it
> runs on an EMR (OpenEMR/Epic/any FHIR server), we read it live from there. The
> endpoints below are identical either way — that is the whole point.

---

## Endpoints

### `GET /me`
Confirm a key works before you wire anything else up.

```bash
curl https://HOST/api/v1/me -H "Authorization: Bearer $CLINICBOOK_API_KEY"
```
```json
{
  "success": true,
  "data": {
    "clinicId": "cmr0h…",
    "clinicName": "Demo Clinic (Sandbox)",
    "mode": "TEST",
    "scopes": ["read", "write"],
    "sandbox": true
  }
}
```

### `GET /doctors`
The clinic's bookable doctors, ordered by name.

```json
{ "success": true, "data": [
  { "id": "cmr5y…", "name": "Dr. Meera Rao", "speciality": "Cardiology" }
] }
```

### `GET /doctors/:id/slots?date=YYYY-MM-DD`
Open start times for that doctor on that date, in clinic-local time. Past and
near-past slots are already filtered out — anything returned here is bookable
**right now**.

```json
{ "success": true, "data": {
  "doctorId": "cmr5y…", "date": "2026-07-13",
  "slots": ["09:00 AM", "09:30 AM", "10:00 AM"]
} }
```

### `POST /appointments`
Book. The patient is identified by **phone** — we find-or-create them, so you never
have to store our patient ids.

| field | required | notes |
|---|---|---|
| `doctorId` | ✅ | from `GET /doctors` |
| `patientName` | ✅ | |
| `patientPhone` | ✅ | the patient identity within your clinic |
| `patientLanguage` | | defaults to English |
| `date` | ✅ | `YYYY-MM-DD` |
| `time` | ✅ | `"10:00 AM"`, `"10:00"`, `"10am"` — we canonicalise |
| `notify` | | `false` to suppress **our** WhatsApp confirmation. Default `true` |

```bash
curl -X POST https://HOST/api/v1/appointments \
  -H "Authorization: Bearer $CLINICBOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: booking-98a7f2" \
  -d '{"doctorId":"cmr5y…","patientName":"Ankit Rai",
       "patientPhone":"+919812345678","date":"2026-07-13","time":"10:00 AM"}'
```
`201` →
```json
{ "success": true, "data": {
  "id": "cmrbv…", "status": "PENDING", "date": "2026-07-13", "time": "10:00 AM",
  "doctor":  { "id": "cmr5y…", "name": "Dr. Meera Rao", "speciality": "Cardiology" },
  "patient": { "id": "cmrbv…", "name": "Ankit Rai", "phone": "+919812345678" }
} }
```

| status | meaning |
|---|---|
| `404` | no such doctor at this clinic |
| `409` | slot not bookable (taken, past, or outside the doctor's schedule) |
| `409` | another request with the same `Idempotency-Key` is still in flight |
| `400` | validation — the message names the offending field |

### `GET /appointments/:id`
### `PATCH /appointments/:id`
Cancel **or** reschedule — one or the other, not both.

```jsonc
{ "status": "CANCELLED" }        // cancel: frees the slot, messages the patient once
{ "time": "12:30 PM" }           // reschedule
{ "date": "2026-07-14", "time": "09:00 AM" }
```

---

## Idempotency

Send an `Idempotency-Key` header on `POST /appointments`. If your request times out
and you retry with the **same key**, we **replay the original booking** instead of
creating a second one:

```json
{ "success": true, "data": { "id": "cmrbv…", … }, "replayed": true }   // HTTP 200
```

Use a fresh, unique key per booking attempt (a UUID, or your own booking id). Keys
are scoped to your clinic. A retry while the first request is still running returns
`409` — wait and retry.

Without a key you are still protected from double-booking *the same slot* (an atomic
slot lock returns `409`), but you cannot distinguish "already booked by me" from
"booked by someone else". Send the key.

---

## Webhooks

Rather than polling, register a URL and we will POST you every event you subscribe
to. Delivery is durable: if your endpoint is down we retry (1m, 5m, 30m, 2h, 6h)
before parking the delivery as failed.

**Events:** `appointment.booked` · `appointment.cancelled` · `appointment.rescheduled` · `appointment.completed`

Each request carries:

| header | |
|---|---|
| `X-ClinicBook-Event` | the event name |
| `X-ClinicBook-Delivery` | stable delivery id — **dedupe on this** |
| `X-ClinicBook-Signature` | `t=<unix>,v1=<hex>` |

```json
{
  "id": "cmrbw…",                       // == X-ClinicBook-Delivery
  "event": "appointment.booked",
  "data": { "clinicId": "cmr0h…", "appointmentId": "cmrbv…",
            "patientId": "…", "doctorId": "…",
            "appointmentDate": "2026-07-13", "appointmentTime": "10:00 AM" }
}
```

Delivery is **at-least-once** — a network failure after we sent but before we
recorded success means you may see the same `X-ClinicBook-Delivery` twice. Treat it
as an upsert.

### Verifying the signature

`v1` is `HMAC_SHA256(secret, "{t}.{rawBody}")` in hex. The timestamp is inside the
signed material, so a captured request cannot be replayed with a fresh stamp.
**Verify against the raw request body**, before any JSON parsing/re-serialising.

```js
const crypto = require('crypto');

function verify(secret, rawBody, header, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(',').map(kv => {
    const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)];
  }));
  const t = Number(parts.t);
  if (!Number.isFinite(t)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSec) return false;   // replay

  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const provided = Buffer.from(parts.v1 ?? '', 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
```

Reject anything that fails. Respond `2xx` once you have durably accepted the event —
any other status (or a timeout) makes us retry.

---

## Errors

| status | when |
|---|---|
| `400` | validation — the message names the field, e.g. `date: date must be YYYY-MM-DD` |
| `401` | missing, unknown, or revoked API key |
| `403` | the key is valid but lacks the scope this endpoint needs |
| `404` | the doctor/appointment does not exist **at your clinic** |
| `409` | slot unavailable, or an idempotent request is in flight |
| `429` | per-key rate limit — see the `RateLimit-*` headers |

---

## Keys

Issued per clinic from the dashboard's **Developers &amp; API** tab; we store only a
SHA-256 hash, so the key is shown **once**. Treat it as a password: server-side
only, never in a browser or mobile app. Revoking takes effect on the next request.

To rotate without downtime: issue the new key, switch your app over, then revoke
the old one. A clinic may hold any number of live and test keys at once.
