# Production email (Resend) — verify clinicbook.ai

OTP verification emails are sent via Resend. The app sends from `EMAIL_FROM`
(read at runtime), so **once the domain is verified the only change is the
`EMAIL_FROM` environment variable — no code change, no redeploy of code**
(updating a Railway variable just restarts the service).

## The limitation we're fixing

With no verified domain, Resend's test sender `onboarding@resend.dev` delivers
**only to your own Resend account email**. To email *any* clinic owner you must
verify a custom domain and send from it.

## Steps (one-time)

1. **Resend → Domains → Add Domain** → enter `clinicbook.ai`. (Pick the region
   closest to Railway; it affects the MX/SPF host values shown.)
2. Resend shows ~3–4 DNS records. Add them at the DNS provider for `clinicbook.ai`.
   They look like this (copy the **exact** values from the Resend page — the DKIM
   key is unique to your domain, and the region in the MX/SPF host may differ):

   | Type | Name / Host | Value | Notes |
   | --- | --- | --- | --- |
   | `MX` | `send` | `feedback-smtp.us-east-1.amazonses.com` | priority `10` (region per Resend) |
   | `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | SPF for the Return-Path |
   | `TXT` | `resend._domainkey` | `p=MIGfMA0GCSq…` (long key) | **DKIM — unique, from the dashboard** |
   | `TXT` | `_dmarc` | `v=DMARC1; p=none;` | optional but recommended |

3. Back in Resend, click **Verify**. DNS can take a few minutes (up to ~1 hour)
   to propagate; Resend shows **Verified** when ready.
4. In **Railway → the backend service → Variables**, set:

   ```
   EMAIL_FROM=ClinicBook AI <noreply@clinicbook.ai>
   ```

   (A bare `EMAIL_FROM=noreply@clinicbook.ai` also works; the display-name form
   shows nicer in inboxes.) Saving the variable restarts the service.
5. Confirm in the Railway deploy logs — the startup banner prints:

   ```
   [email] Resend configured. Sender (EMAIL_FROM): ClinicBook AI <noreply@clinicbook.ai>
   ```

   If you instead see the `@resend.dev` warning, the variable wasn't picked up.

## Verify delivery

Sign up a clinic with **any** external email address → the 6-digit OTP should
arrive. Keep `RESEND_API_KEY` as-is (unchanged).

## Notes

- `RESEND_API_KEY` stays the same — only `EMAIL_FROM` changes.
- The from-domain in `EMAIL_FROM` **must match** the verified Resend domain
  (`clinicbook.ai`), or Resend rejects the send.
- Email send is non-fatal in code: if Resend ever rejects/errors, signup still
  succeeds and the user can use **Resend code** — but no email arrives until the
  domain is verified and `EMAIL_FROM` is correct.
- Deliverability tip: keep the DMARC record and warm up volume gradually; Resend's
  dashboard shows bounce/complaint rates.
