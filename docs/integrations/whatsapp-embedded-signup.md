# WhatsApp Embedded Signup + self-service onboarding

How a clinic goes from signup to a live WhatsApp number in ~5–10 minutes with
**zero manual work by us**. This is the Stripe-Connect-style flow.

## Funnel

```
Landing → Start Free Trial → Create Clinic Account → Verify Email (OTP)
  → Welcome screen → Connect WhatsApp (Meta Embedded Signup) → 🟢 Connected → live
```

Doctors/schedules/billing are managed in the dashboard afterwards — they are NOT
part of onboarding.

## What the clinic owner sees

1. **Create account** — clinic name, owner, email, phone, password.
2. **Verify email** — a 6-digit OTP is emailed (Resend); enter it to activate.
   (Hard gate: no dashboard access until verified. Login of an unverified account
   re-sends the code and returns to this screen.)
3. **Welcome → "Connect WhatsApp"** — one button. Meta's official popup opens; the
   owner logs into Facebook, picks their Business + WhatsApp number, and approves.
4. **🟢 WhatsApp Connected Successfully** — shows Business · WhatsApp Number ·
   Webhook Active · Ready to Receive Messages. **No token, phone-number-id, WABA
   id, business id, webhook URL, or API key is ever shown.**

If the number is already used by another clinic: **"This WhatsApp number is
already connected to another clinic."** If a token later expires, the dashboard
shows **Reconnect WhatsApp**.

## What the backend does automatically (on `POST /api/whatsapp/embedded-signup`)

Given the popup's OAuth `code` + session info (`phone_number_id`, `waba_id`):
1. Exchange the code for an access token (`/oauth/access_token`, server-side).
2. Resolve the owning **Business id** from the WABA.
3. Verify the token + number against Meta.
4. **Subscribe** our app to the WABA webhooks (`POST /{waba}/subscribed_apps`).
5. **Encrypt** the access token at rest (AES-256-GCM, `WA_CHANNEL_ENC_KEY`).
6. **Upsert** a `WhatsAppChannel` bound to the authenticated clinic (rejects a
   number already owned by another clinic → 409).
7. Clear the routing cache so inbound/outbound use the new channel immediately.

Code: `whatsapp.embeddedSignup.ts` + `whatsapp.onboarding.ts`. This matches Meta's
official Embedded Signup: Facebook Login **for Business** + `config_id`,
`response_type=code`, `sessionInfoVersion:3`, session info via the `message` event,
server-side code exchange, and app subscription on the WABA.

## One-time platform setup (Meta App dashboard — NOT code)

Do this **once**; no per-clinic configuration ever.

1. **Meta App** (Business type) at developers.facebook.com.
2. Add products: **Facebook Login for Business** and **WhatsApp**.
3. Create an **Embedded Signup configuration** → copy its **`config_id`**.
4. Request **Advanced Access** for `whatsapp_business_management` and
   `whatsapp_business_messaging`.
5. Set the **webhook callback URL** to `<PUBLIC_BASE_URL>/api/whatsapp/webhook` and
   the verify token to `VERIFY_TOKEN`; subscribe to the `messages` field.
6. Complete **Business verification**, add a **privacy policy URL** and your
   **app domain**, and switch the app to **Live** mode.
7. For onboarding other businesses you typically need **Tech Provider / Solution
   Partner** status.

## Environment (set once at the platform level)

| Var | Purpose |
| --- | --- |
| `META_APP_ID` | Facebook App id (public; front-end SDK). |
| `META_APP_SECRET` | App secret for the server-side code exchange (defaults to `WHATSAPP_APP_SECRET`). |
| `META_CONFIG_ID` | Embedded Signup configuration id. |
| `META_GRAPH_VERSION` | Graph API version (default `v20.0`). |
| `WA_CHANNEL_ENC_KEY` | 32-byte hex; encrypts stored tokens. Set before clinics onboard. |
| `RESEND_API_KEY` | Resend key for OTP emails (unset → OTP logged to console in dev). |
| `EMAIL_FROM` | Verified Resend sender (e.g. `ClinicBook AI <noreply@yourdomain>`). |

The front-end fetches the public bits (`appId`, `configId`) from
`GET /api/whatsapp/embedded-signup/config` at runtime — **no front-end rebuild or
env change when these are set**.

## Endpoints

| Method · Path | Purpose |
| --- | --- |
| `GET /api/whatsapp/embedded-signup/config` | Public Meta config for the SDK. |
| `POST /api/whatsapp/embedded-signup` | One-click onboard (code + session info). |
| `GET /api/whatsapp/channel` | Status `{ channel, healthy }` (no token). |
| `DELETE /api/whatsapp/channel` | Disconnect (for reconnect). |
| `POST /api/whatsapp/channel` | Manual fallback (paste creds) — admin only. |

## Current single-number note

Until clinics onboard their own numbers, inbound WhatsApp binds to the env default
clinic (`WHATSAPP_CLINIC_ID`). Dashboard data is fully clinic-isolated regardless.
Once a clinic completes Embedded Signup, its messages route to its own channel
(by `phone_number_id`) — the multi-tenant routing is already in place.

## Verification

- Email/OTP: `cd backend && npm test` (OTP unit tests) + register locally (the code
  is logged when `RESEND_API_KEY` is unset).
- Live Embedded Signup needs the Meta `config_id` + a real Facebook business login;
  click "Connect WhatsApp" in the Welcome screen or Settings tab and confirm the
  🟢 status card. The cross-clinic 409 and reconnect paths are covered.
