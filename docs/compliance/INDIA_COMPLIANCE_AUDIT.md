# India Healthcare Compliance Audit — ClinicBook AI + MediScribe (NovaScribe)

**Audit date:** 17 August 2026
**Scope:** the code in this repository as of commit `0419b2a`, plus its deployed configuration (Railway backend, Vercel frontend, EAS Android builds).
**Method:** source inspection only. No penetration test, no infrastructure audit, no legal review.

---

## 0. What this document is, and what it is not

This is a **technical** audit. It says what the code does and does not do, measured against what the named frameworks require.

It is **not** a legal opinion and it is **not** a certification. Several items below cannot be settled by reading code at all — they depend on contracts, on who is deemed the Data Fiduciary, and on rules whose commencement dates are phased. Those are marked **LEGAL CONFIRMATION REQUIRED** and must go to a lawyer who practises Indian data-protection and healthcare law. Nothing here should be read as "we are compliant."

A useful framing for everything that follows: **technical controls are necessary but not sufficient.** You can build every control listed here and still be non-compliant because a contract is missing, and you can have every contract and still be exposed because the controls are missing.

---

## 1. The system as it actually exists

### 1.1 Components

| Component | Where | What it holds |
|---|---|---|
| ClinicBook web dashboard | `src/` → Vercel | Clinic staff UI. No PHI at rest (browser only). |
| ClinicBook Android app | `mobile/` | WebView shell around the dashboard. |
| MediScribe web | `src/mediscribe/` → Vercel | Doctor scribe UI inside the same shell. |
| MediScribe Android app | `mediscribe-app/` | Native Expo app. Records audio, stores a session token + AI chat history on device. |
| Backend API | `backend/src/` → Railway | The only system of record. |
| Database | Railway PostgreSQL | All patient, doctor, appointment, consultation and message data. |
| Consultation audio | container temp dir (`os.tmpdir()`) unless `STORAGE_S3_*` is set | Raw recordings of patient visits. |

### 1.2 Personal and health data inventory

| Data | Model / location | Sensitivity |
|---|---|---|
| Patient name, phone, age, gender, language, health concern | `Patient` (`prisma/schema.prisma:276`) | Personal + health |
| Appointments, status, notes | `Appointment` | Health |
| Consultation audio recording | filesystem / S3 object | **Highest** — raw doctor-patient conversation |
| Transcript | `NovaDoc` JSON | **Highest** |
| AI-generated clinical report / note | `NovaDoc` JSON | Health |
| AI-generated prescription draft + final | `NovaDoc` JSON | Health |
| WhatsApp message bodies (outbound) | `WhatsAppLog.body` | Health (contains prescriptions) |
| Inbound patient messages + AI interpretation | `WhatsAppAudit.message` | Health |
| Patient timeline events | `PatientEvent` | Health |
| Medicine reminders | `MedicineReminder` | Health |
| AI assistant conversations | `AiConversation` / `AiMessage` | Health |
| Staff credentials | `User.passwordHash` (bcrypt cost 12) | Personal |
| Clinic WhatsApp access tokens | `WhatsAppChannel.accessToken` (AES-256-GCM when `WA_CHANNEL_ENC_KEY` set — it **is** set on Railway) | Secret |

### 1.3 Third parties that receive personal or health data

| Processor | What it receives | Location |
|---|---|---|
| **Sarvam AI** | Consultation **audio**, transcripts, and the prompt that generates the clinical report | India (stated) — confirm contractually |
| **OpenAI** | WhatsApp voice notes (Whisper), patient message text, booking-intent prompts, AI assistant prompts | USA |
| **Meta (WhatsApp Cloud API)** | Patient phone number, all message content including prescriptions | USA / global |
| **Railway** | The entire database and all application logs | Region must be confirmed |
| **Vercel** | Frontend hosting; no PHI at rest, but access logs carry IPs | Global edge |
| **Resend** | Staff email addresses, OTP codes | USA |
| **Stripe** | Clinic billing identity | USA |
| **Expo / EAS** | App build artifacts only | USA |

> Every entity in this table is a **Data Processor** under DPDP and needs a written data-processing contract before production launch. This is the single largest non-code gap. **LEGAL CONFIRMATION REQUIRED.**

---

## 2. Who is who under DPDP — settle this first

DPDP obligations attach to the **Data Fiduciary**. Two readings are possible and they lead to different products:

- **Reading A — the clinic is the Fiduciary, we are the Processor.** We process on the clinic's documented instructions. The clinic owes notice, consent and rights-handling to the patient; we owe the clinic security, breach reporting and assistance.
- **Reading B — we are a joint or independent Fiduciary.** Because we make our own decisions (which AI vendor, what the WhatsApp bot says, retention periods), we may be a Fiduciary in our own right for at least some processing.

The code today does not commit to either. The privacy policy at `public/privacy.html` reads as though **we** are the Fiduciary to both clinics and patients, while the product behaves as though the **clinic** owns the patient relationship.

**Action:** get this decided in writing. Everything else — the notice text, who a patient emails to exercise rights, whose name is on the breach report — follows from it. **LEGAL CONFIRMATION REQUIRED.**

---

## 3. Framework-by-framework status

Legend: ✅ implemented · 🟡 partial · ❌ missing · ⚪ not applicable (today) · ⚖️ legal confirmation required

### 3.1 DPDP Act 2023

| § | Requirement | Status | Evidence |
|---|---|---|---|
| 4 | Lawful basis for processing | ❌ | No consent record exists anywhere in the schema. No "legitimate use" determination documented. |
| 5 | Itemised notice at/ before collection | 🟡 | `public/privacy.html` exists and is readable, but it is a website policy, not an itemised notice given at the point of collection. Patients booking on WhatsApp are never shown it. |
| 6 | Free, specific, informed, unconditional, unambiguous consent | ❌ | Nothing captures consent. Grep for `consent` in `prisma/schema.prisma` returns nothing. |
| 6(4)–(6) | Withdrawal as easy as giving | ❌ | No withdrawal mechanism. No WhatsApp STOP/opt-out handler. |
| 7 | Legitimate uses | ⚖️ | Arguably covers some appointment processing; must be assessed, not assumed. |
| 8(4) | Reasonable security safeguards | 🟡 | Good: TLS, bcrypt(12), helmet, rate limits, HMAC webhooks, tenant-scoped Prisma, signed audio URLs, token encryption. Missing: RBAC in ClinicBook core, audit logging, MFA, log hygiene. |
| 8(5) | Breach notification to Board and affected principals | ❌ | No incident process, no contact list, no template, no detection. |
| 8(7) | Erase when purpose is served / consent withdrawn | ❌ | No retention policy, no deletion job. Data is kept forever. |
| 8(9) | Publish contact of DPO / responsible person | 🟡 | An email exists in the policy; no named person, no designated grievance officer. |
| 9 | Children — verifiable parental consent, no tracking/ads | ❌ | India defines a child as **under 18**. Paediatric patients are routine in clinics. `Patient.age` exists but nothing gates on it. |
| 10 | Significant Data Fiduciary obligations (DPIA, audit, DPO) | ⚖️ | Applies only if notified as an SDF. Volume of health data makes this worth asking about. |
| 11 | Right to access information about processing | ❌ | No patient-facing access path. Patients have no login (by product design). |
| 12 | Right to correction and erasure | 🟡 | Staff can edit/delete a patient via the dashboard; there is no *patient-initiated* route and no verified-identity request flow. |
| 13 | Right to grievance redressal | ❌ | No grievance officer named, no SLA, no ticket trail. |
| 14 | Right to nominate | ❌ | Not implemented. |

### 3.2 DPDP Rules 2025

The Rules were notified in **November 2025** with phased commencement; several operative obligations (notice form, consent managers, breach reporting mechanics, rights workflows) phase in over the following 12–18 months. **Confirm the exact applicable dates for your launch with counsel — they determine what is due now versus later.** ⚖️

| Requirement | Status | Note |
|---|---|---|
| Notice in plain language, itemised, standalone | ❌ | Current policy is prose, not itemised per-purpose. |
| Consent record — what, when, for which purpose, version | ❌ | Nothing stored. |
| Consent Manager integration | ⚪ / ⚖️ | Only required if you route consent through a registered Consent Manager. Not applicable if you take consent directly — confirm. |
| Reasonable security: encryption, access control, logging, monitoring | 🟡 | Encryption in transit ✅; at rest depends on Railway (confirm) ; access control partial; **logging and monitoring effectively absent**. |
| Log retention **one year** for breach investigation | ❌ | Railway stdout logs only, short retention, no archive. |
| Breach intimation to affected principals "without delay" + to the Board (initial and detailed) | ❌ | No process. |
| Erasure after defined period of inactivity, with prior notice | ❌ | No inactivity tracking, no erasure job, no pre-erasure notice. |
| Contact of DPO published on website and in every notice | 🟡 | Email only. |

### 3.3 CERT-In Directions, 2022 (applies to any body corporate in India)

| Requirement | Status | Note |
|---|---|---|
| Report listed cyber incidents within **6 hours** of noticing | ❌ | No detection, no runbook, no named reporter. |
| Maintain ICT logs for **180 days**, **within India** | ❌ | Application logs go to Railway stdout. Retention short, region unconfirmed. |
| **NTP sync** to NIC/NPL (or traceable equivalent) | ❌ | Not configured; the container inherits host time. |
| Designated **Point of Contact** filed with CERT-In | ❌ | Not done. |
| KYC/subscriber records (VPS/cloud/VPN providers) | ⚪ | We are not that kind of provider. |
| Records retained 180 days after cancellation | ❌ | No policy. |

> CERT-In is the item most often overlooked and it is the one with the hardest deadline in the whole document — **six hours**. In practice this means: someone's phone number is on a wall, and there is a written page that tells them what to do.

### 3.4 ABDM / Health Data Management Policy

| Requirement | Status | Note |
|---|---|---|
| ABHA-based patient identity | ⚪ | No ABHA anywhere in the codebase. |
| Health Information Provider (HIP) registration | ⚪ | Not registered. |
| Consent Manager (HIE-CM) flow for data sharing | ⚪ | Not applicable while we never share outside the clinic. |
| HDM Policy privacy-by-design principles | 🟡 | Partially met by tenant isolation and access gating. |

ABDM is **voluntary**. It is not required to launch. It becomes required the moment a clinic wants ABHA linkage or government-scheme integration, and it is a real integration project (sandbox, milestone certification, HIP registration) — treat it as a roadmap item, not a compliance blocker. **Do not claim ABDM compliance in any marketing material.**

### 3.5 Other Indian law that actually bites here

| Requirement | Status | Note |
|---|---|---|
| **Medical records retention** — IMC (Professional Conduct) Regulations 2002 §1.3.1: retain records **3 years**; several state Clinical Establishments rules require longer | ❌ | No retention policy at all. Note this **conflicts** with a naive "delete on request" — erasure must carve out records the clinic is legally required to keep. |
| **Telemedicine Practice Guidelines 2020 (NMC)** — patient consent for teleconsultation, doctor identity, prescription rules by drug list | 🟡 / ⚖️ | Prescriptions are delivered on WhatsApp. Whether the flow is "telemedicine" depends on whether the consult was in person. Confirm. |
| **Prescription validity** — registered medical practitioner's name, registration number, signature | 🟡 | `settings.registrationNumber` is captured and prints on the PDF. Digital signature is absent. |
| **Drugs & Cosmetics Rules** — Schedule H / H1 / X handling | ⚖️ | AI-drafted prescriptions can name scheduled drugs. Confirm what the doctor must attest. |
| **IT Act §43A + SPDI Rules 2011** — health data is "sensitive personal data" | 🟡 | Still relevant until DPDP fully supersedes. Requires a published policy (✅) and "reasonable security practices" (ISO 27001 or documented equivalent — ❌). |
| **FHIR / EHR Standards 2016** | 🟡 | `backend/src/integrations/emr/fhir/` **consumes** an external OpenEMR FHIR server. We do not **expose** a FHIR API and do not use SNOMED CT / LOINC / ICD-10 coding internally. |

---

## 4. Gap analysis — the ones that matter

Each entry: **what we have → what is missing → risk → fix → files → test**.

---

### C-1 · No consent is captured anywhere · **CRITICAL**

**What we have.** A privacy policy at `public/privacy.html` linked from the landing page. Nothing else. Grep for `consent` across `prisma/schema.prisma` returns zero fields.

**What is missing.** Any record that a patient was told what happens to their data and agreed to it — most acutely before a **consultation is audio-recorded**. There is no consent to record, no consent to send the audio to an AI vendor, no consent to receive WhatsApp messages, and no version of the notice that was shown.

**Risk.** This is the foundational DPDP failure and it is also the one a patient or a journalist would find first. Recording a medical consultation without consent is separately actionable outside data-protection law. Every downstream control (retention, withdrawal, rights) is meaningless without a consent record to anchor it.

**Fix.** A `PatientConsent` table — patient, clinic, purpose (`whatsapp_messaging` / `consultation_recording` / `ai_processing`), granted/withdrawn timestamps, notice version, channel and evidence of how it was obtained. A first-contact WhatsApp notice with an explicit opt-in. A visible consent step in the recording UI that the doctor cannot skip. A consent check inside `deliverPrescription` and inside the recording upload path.

**Files.** `backend/prisma/schema.prisma` (new model) · new `backend/src/core/consent/` · `backend/src/core/whatsapp/whatsapp.inbound.ts` · `backend/src/products/mediscribe/router.ts` (`/transcribe`, `/save-consultation`) · `src/mediscribe/mobile/MobileConsultation.tsx` and the native `mediscribe-app` recording screen · `src/components/PatientRegistrationQR.tsx` and `AddPatientSheet.tsx`.

**Test.** Recording upload without a consent row → 403. Prescription send without messaging consent → suppressed and logged. Consent version is stamped and immutable. Withdrawal blocks the next send. Existing patients (no consent row) follow a documented grandfathering rule rather than silently failing.

---

### C-2 · No processor contracts with OpenAI, Sarvam, Meta · **CRITICAL** ⚖️

**What we have.** Live API integrations. Consultation audio goes to Sarvam. WhatsApp voice notes go to OpenAI Whisper. Patient message text goes to OpenAI. All prescriptions go through Meta.

**What is missing.** Signed data-processing agreements, a documented sub-processor list, confirmation of where each vendor stores and processes the data, and confirmation of whether any of them train on it.

**Risk.** Health data is leaving the country under no contract. This cannot be fixed in code, and it is the item most likely to stop an enterprise or hospital sale.

**Fix.** Obtain DPAs. Publish a sub-processor list in the privacy notice. For OpenAI specifically, confirm zero-retention / no-training terms, or move voice transcription to an India-hosted model. Add an env-level kill switch so a clinic can be run with **no** US processor in the path.

**Files.** Contracts (not code) · `public/privacy.html` · `backend/src/config/env.ts` (a documented per-clinic AI-vendor gate).

**Test.** Turn the gate off for a clinic and assert no outbound request reaches an unapproved host.

---

### C-3 · No audit trail of who touched which patient record · **CRITICAL**

**What we have.** `WhatsAppAudit` records what the AI understood and which FSM transition followed — a good, narrow audit of one flow. `PatientEvent` records clinical timeline events. That is all. A repo-wide grep for `auditLog` / `accessLog` returns **nothing**.

**What is missing.** The general "who → what → when → which patient" record. Today, if a staff member opened, edited, exported or deleted every patient in a clinic, there would be no way to know afterwards.

**Risk.** DPDP §8(4) safeguards and the DPDP Rules' logging requirement both fail. More practically: you cannot investigate a breach you cannot see, and you cannot answer a patient asking "who looked at my file?"

**Fix.** An append-only `AuditLog` — actor, actor type, clinic, action, resource type/id, patient id, request id, IP, user agent, timestamp. Write it from one middleware plus explicit calls at sensitive points (patient read/update/delete, consultation open, audio playback, prescription send, export, admin actions). Never delete rows; archive them.

**Files.** `backend/prisma/schema.prisma` · new `backend/src/core/audit/` · `backend/src/middleware/` · `backend/src/core/patients/patient.controller.ts` · `backend/src/products/mediscribe/router.ts` · `backend/src/routes/patient360.routes.ts`.

**Test.** Every sensitive route produces exactly one row. Rows carry the request id already generated by `middleware/requestId.ts`. Writes cannot be updated or deleted. Audit failure must never fail the user's request (log and continue).

---

### C-4 · No RBAC in ClinicBook — every logged-in user is effectively an admin · **CRITICAL**

**What we have.** `backend/src/middleware/auth.ts` verifies the JWT and rejects doctor-portal tokens. That is the *entire* authorisation model for ClinicBook. `patientRouter.use(requireAuth)` and then every route — create, read, update, **delete** — is open to any authenticated user of the clinic. MediScribe, by contrast, has a real permission matrix (`products/mediscribe/contracts/index.ts`, `ROLE_PERMISSIONS`, `can()`).

**What is missing.** Role enforcement in core. `UserRole` exists in the schema and is essentially decorative on the ClinicBook side.

**Risk.** A receptionist can delete every patient record in the clinic. There is no audit log (see C-3) to notice. This is both a DPDP safeguards failure and an ordinary business risk.

**Fix.** Port MediScribe's permission-matrix approach into `core` and gate the destructive and bulk-read routes first: patient delete, patient list export, clinic settings, API keys, WhatsApp channel management, billing. Deliberately fail **closed** for new permissions but ship with today's behaviour preserved for existing roles, so no working screen breaks.

**Files.** new `backend/src/core/authz/` · `backend/src/middleware/auth.ts` · every `*.routes.ts` under `backend/src/core/`.

**Test.** A matrix test: for each role × each route, the expected allow/deny. A "no route is ungated" test in the spirit of the existing `architecture.test.ts` ratchet.

---

### C-5 · Consultation audio survives on disk with no retention limit, and is lost on deploy · **CRITICAL**

**What we have.** A storage port with local-disk and S3 adapters, HMAC-signed URLs with a 60-minute TTL, clinic-scoped object keys, and a clinic check on playback (`backend/src/core/storage/`, `router.ts:168`). Good design.

**What is missing.** `STORAGE_S3_*` is **not set on Railway**, so audio lands in `os.tmpdir()` and is destroyed on every deploy. And there is no retention rule — where storage *is* durable, recordings are kept forever.

**Risk.** Two opposite failures at once: data the clinic expected to keep is lost (an availability and record-keeping problem), and data that should have been erased is kept indefinitely (a DPDP §8(7) problem).

**Fix.** Set `STORAGE_S3_*` to a **private** bucket in an Indian region (Cloudflare R2 / AWS ap-south-1) with server-side encryption and versioning. Then add a retention job: delete audio N days after the note is finalised (N to be set with counsel — the *transcript and note* are the medical record and must survive the audio).

**Files.** Railway env · `backend/src/core/storage/s3.storage.ts` · new `backend/src/cron/retention.cron.ts`.

**Test.** Signed URL expiry. Cross-clinic key access → 403. Retention job dry-run listing what it *would* delete before any `--apply`, matching the pattern already used by `backend/scripts/backfillNovaDocPatientId.ts`.

---

### H-1 · No breach detection, no incident process, no 6-hour path · **HIGH**

**What we have.** Crash handlers and request ids. Nothing that says "this is an incident."

**What is missing.** Detection, a written runbook, a named responder, CERT-In's 6-hour report path and DPDP's notification to the Board and to affected patients.

**Risk.** The deadline is six hours from *noticing*. Without a runbook, the first hour goes to deciding who decides.

**Fix.** A one-page runbook (who, what, in what order, with the CERT-In form pre-filled). Alerting on auth-failure spikes, 5xx spikes, and unusual bulk reads (which requires C-3). A breach register.

**Files.** `docs/compliance/INCIDENT_RESPONSE.md` (new) · alerting configuration · `backend/src/core/audit/`.

**Test.** A tabletop exercise: simulate a leaked token and time the response.

---

### H-2 · Logs contain patient phone numbers and health text, and are not retained as required · **HIGH**

**What we have.** `morgan('combined')` to stdout, plus 236 `console.*` calls. Among them:
- `whatsapp.inbound.ts:177` logs the patient's phone number on every inbound message.
- `whatsapp.voice.ts:111` logs the **first 80 characters of a transcribed patient voice note** — i.e. what the patient said about their health.
- `whatsapp.notifications.ts:219` logs registration dispatch details.

**What is missing.** Redaction, and the opposite problem: DPDP Rules expect logs kept **one year** and CERT-In **180 days within India**. Railway stdout gives neither.

**Risk.** Health data is being copied into an operational log store with a different (weaker, and vendor-controlled) access model — and simultaneously the compliance-relevant logs are not being kept long enough.

**Fix.** A redacting logger: phone numbers masked to last 4 digits, no message bodies, no transcript previews. Then ship logs to an India-region store with a one-year retention.

**Files.** `backend/src/middleware/logger.ts` · `backend/src/core/whatsapp/*.ts` · deployment config.

**Test.** A lint-style test asserting no `console.*` call in the WhatsApp and MediScribe modules receives a variable named `phone`/`body`/`text`/`transcript` — enforceable the same way `architecture.test.ts` enforces boundaries.

---

### H-3 · No MFA, 7-day non-revocable tokens · **HIGH**

**What we have.** bcrypt cost 12 ✅, min-8-character passwords, `authLimiter` at 20 attempts / 15 min ✅, email OTP **at signup only**, and `JWT_EXPIRES_IN` defaulting to `7d`.

**What is missing.** MFA at login. A refresh/revocation model — a stolen token is valid for seven days and **cannot be revoked**; there is no logout-everywhere, no session list, no token version. No password complexity beyond length, no lockout, no breach-password check.

**Risk.** One phished doctor account exposes an entire clinic's records for a week. For accounts that can read health data, single-factor is below the bar a regulator or hospital procurement will expect.

**Fix.** TOTP MFA (required for admin, optional-then-required for doctors), reusing the OTP infrastructure already in `core/auth/otp.service.ts`. Short access token + refresh token with a `tokenVersion` on `User` so revocation is one UPDATE. Session list + "sign out everywhere."

**Files.** `backend/src/core/auth/` · `backend/src/config/jwt.ts` · `backend/prisma/schema.prisma` · login UI in `src/` and in `mediscribe-app/src/context/Auth.tsx` (note: that app is reproduced verbatim from its reference — any change there must be a deliberate, documented divergence).

**Test.** MFA-required roles cannot obtain a token without the second factor. Bumping `tokenVersion` invalidates every existing token immediately.

---

### H-4 · No data-retention policy or erasure job · **HIGH**

**What we have.** Nothing is ever deleted. The only `deleteMany` calls in the codebase are operational (dedupe rows, send counters, reminder resync) — none are retention.

**What is missing.** A retention schedule per data class, an erasure job, and — critically — the **carve-out** for records that Indian medical-record rules require the clinic to keep (≥3 years, longer in some states).

**Risk.** DPDP §8(7) requires erasure when the purpose is served. Retaining every recording and message forever is the opposite. Getting this wrong in the other direction (deleting a medical record a clinic is legally required to hold) is worse.

**Fix.** Write the schedule first as a document, get it confirmed legally, then implement. Suggested starting point to be reviewed: audio 90 days after finalisation · transcripts and notes 3+ years (clinic-configurable) · WhatsApp message logs 12 months · audit logs 1 year minimum · inactive patient review after 3 years with prior notice.

**Files.** `docs/compliance/RETENTION_POLICY.md` (new) · `backend/src/cron/retention.cron.ts` (new) · `public/privacy.html`.

**Test.** Dry-run first, always. Assert the legal-hold carve-out is honoured. Assert deleting audio never orphans the clinical record.

---

### H-5 · Patient rights have no route in or out · **HIGH**

**What we have.** An email address in the privacy policy. Staff can edit and delete a patient from the dashboard.

**What is missing.** By product design, patients have **no login** — so DPDP §11/§12/§13 rights (access, correction, erasure, grievance) have no self-service path and no verified-identity path. There is also no way to *export* one patient's data (there is no CSV/JSON export anywhere except the prescription PDF).

**Risk.** A rights request arriving by email cannot be fulfilled reliably, cannot be evidenced, and has no SLA clock.

**Fix.** Given the product model, the right answer is probably **WhatsApp-verified** self-service: the patient's number is already verified by Meta, so a request from that number is reasonably authenticated. Add a rights menu on WhatsApp ("my data", "delete my data", "stop messages"), a staff-side request queue with an SLA timer, and a machine-readable per-patient export built on the existing `patient360` aggregation.

**Files.** `backend/src/products/clinicbook/whatsapp/` · `backend/src/routes/patient360.routes.ts` · new `backend/src/core/rights/` · dashboard UI.

**Test.** A request from an unverified number is refused. Export contains every table holding that patient's data (assert against `TENANT_MODELS` so a new model cannot be silently omitted). Deletion honours the legal-hold carve-out and leaves an audit row.

---

### H-6 · Self-registration does not verify the phone number · **HIGH**

**What we have.** `POST /api/public/clinic/:clinicId/register`, rate limited to 10/hour per IP, Zod-validated.

**What is missing.** Phone ownership is never proven. Anyone can register any number, and that number then receives clinic WhatsApp messages.

**Risk.** Nuisance messaging and a data-quality problem that later contaminates the WhatsApp identity model — where the phone number **is** the patient's identity.

**Fix.** OTP-verify the number at registration (the OTP service already exists), or defer creation until the patient's first inbound WhatsApp message.

**Files.** `backend/src/core/patients/public.controller.ts` · `backend/src/core/auth/otp.service.ts` · `src/components/PatientRegistrationQR.tsx`.

**Test.** Unverified registration cannot trigger an outbound message.

---

### H-7 · MediScribe app stores a 7-day token and AI chat history unencrypted on the device · **HIGH**

**What we have.** `AsyncStorage` keys: `novascribe.session.token`, `novascribe.assistant.v2` (chat history), `novascribe.settings`.

**What is missing.** The token is in plain `AsyncStorage`, not Keychain/Keystore (`expo-secure-store`). The assistant chat history can contain patient clinical questions and is stored unencrypted. No app lock, no screenshot protection (`FLAG_SECURE`), no remote wipe, no idle timeout.

**Risk.** A lost or rooted doctor phone yields a week-valid clinic token plus locally cached clinical text.

**Fix.** Move the token to `expo-secure-store`; stop persisting clinical assistant history on device (or encrypt it and cap it); add `FLAG_SECURE` and a biometric app lock.

**Files.** `mediscribe-app/src/context/Auth.tsx`, `src/services/chatHistory.ts`, `app.json`.

> **Note the constraint:** `mediscribe-app/` is reproduced byte-for-byte from its reference by explicit instruction. These changes are worth making, but each one is a **deliberate documented divergence** from that reference and must be recorded, or the next re-copy will silently undo them.

---

### M-1 · Encryption at rest is assumed, not verified · **MEDIUM** ⚖️

TLS in transit ✅. WhatsApp tokens AES-256-GCM ✅. But whether the Railway Postgres volume and the log store are encrypted at rest, in which **region**, and with what backup encryption — none of that is established in this repository. Database-level or column-level encryption for the highest-sensitivity fields (transcript, report) is also absent.

**Fix.** Confirm Railway's region and at-rest encryption in writing; if the region is outside India, decide whether that is acceptable (DPDP permits cross-border transfer except to restricted countries, but sector expectations and client contracts often demand India-resident storage). Consider `pgcrypto` for transcript/report columns.

---

### M-2 · Backup and recovery are unverified · **MEDIUM**

Managed Postgres implies backups, but there is no documented RPO/RTO, no evidence of a restore ever being tested, and no backup of the **audio** at all (it is in a temp dir — see C-5). An untested backup is not a backup.

---

### M-3 · No FHIR interop, no coded terminology · **MEDIUM**

We consume an external OpenEMR FHIR server (`backend/src/integrations/emr/fhir/`) but expose nothing. Clinical content is free text — no ICD-10, SNOMED CT or LOINC coding. Fine for launch; a blocker for ABDM, for hospital integrations, and for any analytics claim.

---

### M-4 · No monitoring, no time sync, no vulnerability management · **MEDIUM**

No NTP configuration (CERT-In requires NIC/NPL sync — and it also makes audit timestamps defensible). No dependency-vulnerability scanning in CI. No documented patch cadence. `numReplicas: 1` in `railway.json` means a single instance is still the availability blocker noted in earlier work.

---

### L-1 · Signed audio URLs reuse `JWT_SECRET` as the HMAC key · **LOW**

`backend/src/core/storage/index.ts:44`. Works correctly, but key separation is cheap and rotating one secret should not invalidate the other.

### L-2 · Privacy notice is not DPDP-shaped · **LOW** (effort) / **HIGH** (visibility)

`public/privacy.html` is a solid Meta-review-grade policy. It is not an itemised DPDP §5 notice: no per-purpose itemisation, no named grievance officer, no stated retention periods, no processor list, no nomination right, no children's-consent mechanism, and no Hindi (or other regional-language) version — DPDP requires the notice be available in the Eighth Schedule languages.

### L-3 · `WhatsAppLog.body` stores full prescription text indefinitely · **LOW→MEDIUM**

Useful for support, but it is a second permanent copy of clinical content in a table nobody thinks of as clinical. Should fall under the retention schedule (H-4).

---

## 5. The two flows you asked to be audited specifically

### 5.1 MediScribe — record → transcribe → AI summary → AI prescription draft → doctor review → final

| Step | Control today | Verdict |
|---|---|---|
| Recording starts | Microphone permission requested; **no consent step** | ❌ C-1 |
| Audio uploaded | Authenticated, clinic-scoped, 25 MB cap; tenant context now correct (fixed in `0419b2a`) | ✅ |
| Audio at rest | Signed URLs, clinic check, but ephemeral storage and no retention | 🟡 C-5 |
| Transcription | Sent to Sarvam; no contract, no consent, no de-identification | ❌ C-2 |
| AI report | `POST /generate-report` → Sarvam; output returned to the doctor as a **draft** | ✅ (as a draft) |
| Doctor review | The doctor must set `status: 'Completed'` — AI cannot do this itself | ✅ |
| Prescription send | `sendPrescriptionOnFinalize` fires **only** on the doctor's finalisation; idempotent via `prescriptionSentAt`; a doctor may only send their own patients' | ✅ |
| Audit of the decision | `doctorId` and `status` only. **No record of what the AI proposed vs what the doctor changed**, no reviewed-at timestamp, no immutable copy of what was sent | ❌ |

**Verdict: the human-in-the-loop gate is real.** The AI genuinely cannot approve or send a prescription — that requires the doctor to finalise the note. This is the right design and it is worth defending explicitly in a test, because it is currently an emergent property of the flow rather than a stated invariant.

**What is missing is the evidence.** If a prescription is later disputed, the system cannot show *what the AI generated*, *what the doctor changed*, *when they reviewed it*, or *what exactly was delivered*. For AI-assisted clinical output that is the single most important record to have. Store the AI draft immutably alongside the final, with a diff and a reviewed-at/reviewed-by stamp.

### 5.2 ClinicBook — WhatsApp patient journey

| Step | Control today | Verdict |
|---|---|---|
| Patient messages the clinic | Number verified by Meta; webhook HMAC-verified (`X-Hub-Signature-256`) ✅; inbound de-duplicated ✅ | ✅ |
| Identification | Phone number → `Patient`, scoped per clinic; `WhatsAppSession` and `WhatsAppConversation` re-keyed on `(clinicId, phone)` so one clinic can never read another's session | ✅ Good tenant isolation |
| Privacy notice / consent | **Nothing is ever shown or asked** | ❌ C-1 |
| MCP / intent | LLM classifies intent; the **FSM owns every transition** — the model is not in the control loop; `WhatsAppAudit` records message → intent → confidence → state transition → action | ✅ Genuinely good |
| Booking / reschedule / cancel | Deterministic FSM, `PENDING` bookings, clinic-local timezone handling | ✅ |
| Reminders, follow-ups | Cron; 24h-window rules respected via `sendTemplatedOrSession` | ✅ |
| Opt-out | **No STOP handler.** A patient cannot stop messages | ❌ |
| Message content retention | `WhatsAppLog.body` and `WhatsAppAudit.message` kept forever | ❌ H-4 |
| Voice notes | Audio → OpenAI Whisper (USA), no consent, and the transcript preview is **written to application logs** | ❌ C-2, H-2 |

**Verdict:** the *engineering* of this flow is the strongest part of the system — the FSM-owns-transitions design and the per-clinic session keying are exactly right, and `WhatsAppAudit` is a genuine AI-decision audit trail. The *compliance wrapper* around it is absent: no notice, no consent, no opt-out, no retention.

---

## 6. Priority list

### CRITICAL — do not launch to real patients without these
1. **C-1** Patient consent capture — especially consent to record a consultation
2. **C-2** Data-processing agreements with OpenAI, Sarvam, Meta ⚖️
3. **C-3** Audit logging (who → what → when → which patient)
4. **C-4** RBAC in ClinicBook core
5. **C-5** Durable, private, India-region audio storage + retention
6. **§2** Decide the Data Fiduciary question in writing ⚖️

### HIGH — within the first weeks of launch
7. **H-1** Incident response + CERT-In 6-hour path
8. **H-2** Log redaction, and log retention that meets 180 days / 1 year
9. **H-3** MFA + revocable sessions
10. **H-4** Retention policy (with the medical-record carve-out) ⚖️
11. **H-5** Patient rights: access, correction, erasure, grievance, export
12. **H-6** Phone verification at self-registration
13. **H-7** Mobile app: secure token storage, no clinical text cached in the clear

### MEDIUM
14. **M-1** Confirm at-rest encryption and region ⚖️
15. **M-2** Test a restore; back up audio
16. **M-4** NTP, dependency scanning, monitoring
17. **L-2** Rewrite the privacy notice DPDP-shaped, with a Hindi version
18. **L-3** Bring `WhatsAppLog.body` under retention

### LOW
19. **M-3** FHIR / coded terminology
20. **L-1** Separate HMAC key from `JWT_SECRET`
21. ABDM / ABHA readiness (roadmap, not compliance)

---

## 7. Recommended phases

Each phase is independently shippable and leaves the system working. Nothing here requires breaking an existing feature; where a phase changes behaviour, it ships **behind a flag, defaulting to today's behaviour**, and is switched on per clinic.

**Phase 0 — Decisions and paperwork (no code).**
Fiduciary determination · DPAs with the three AI/messaging vendors · confirm Railway region and at-rest encryption · name a DPO and a grievance officer · file the CERT-In point of contact · agree the retention schedule with counsel. *This phase gates the design of Phases 1 and 4, so it runs first and in parallel with nothing else.*

**Phase 1 — Consent and notice.** `PatientConsent` model, WhatsApp first-contact notice + opt-in + STOP, recording-consent gate in both scribe UIs, DPDP-shaped notice with a Hindi version. *Grandfathering rule for existing patients decided explicitly, not by accident.*

**Phase 2 — Audit and access control.** `AuditLog` + middleware + call sites; RBAC in core, gating destructive routes first, fail-closed for new permissions and behaviour-preserving for existing roles; the role×route matrix test.

**Phase 3 — Security hardening.** MFA, refresh tokens + `tokenVersion` revocation, log redaction, India-region log shipping with one-year retention, NTP, dependency scanning, mobile secure storage.

**Phase 4 — Retention and rights.** Durable S3 audio in an Indian region, retention cron (dry-run first) with the legal-hold carve-out, WhatsApp-verified patient rights menu, staff request queue with SLA, per-patient export driven off `TENANT_MODELS`.

**Phase 5 — Incident readiness.** Runbook, alerting on the signals Phase 2 makes visible, breach register, and a tabletop exercise that is actually run.

**Phase 6 — Interop (optional, commercial).** FHIR resources exposed, ICD-10/SNOMED coding, then ABDM sandbox → HIP registration if a customer requires it.

---

## 8. Items that cannot be resolved by engineering ⚖️

Take these to a lawyer:

1. Are we a Data Fiduciary, a Processor, or both — and for which processing?
2. Exact commencement dates of the DPDP Rules 2025 obligations relative to our launch date.
3. Lawful basis for processing children's health data in a clinic setting, and what "verifiable parental consent" must look like in practice for under-18 patients.
4. Minimum medical-record retention for our target states, and how it interacts with the DPDP erasure right.
5. Whether the WhatsApp prescription flow constitutes telemedicine under the NMC 2020 guidelines, and what that requires of the doctor.
6. Whether AI-drafted prescriptions naming Schedule H/H1/X drugs impose additional attestation duties on the prescriber.
7. Whether sending health data to a US-based processor (OpenAI, Meta) is acceptable for our customer segment, contractually and reputationally.
8. Whether we are likely to be notified as a Significant Data Fiduciary at our projected volume.
9. Whether ISO 27001 (or a documented equivalent) is needed for the "reasonable security practices" standard our customers will contract to.

---

## 9. What is already good — worth saying plainly

It would be misleading to present only gaps. The following are genuinely well built and should not be disturbed:

- **Multi-tenant isolation.** A tenant-scoping Prisma extension plus a schema-parsing test (`backend/src/config/tenancy.test.ts`) that **fails the build** if a model carrying `clinicId` is neither scoped nor explicitly exempted with a stated reason. WhatsApp sessions and conversation windows are re-keyed per `(clinicId, phone)`, so one clinic can never read or overwrite another's. This is stronger than most systems at this stage.
- **AI is not in the control loop.** WhatsApp booking is a deterministic FSM; the LLM only classifies. `WhatsAppAudit` records the understanding and the transition separately. Prescriptions require an explicit doctor finalisation.
- **Architecture boundary enforcement.** `backend/src/architecture.test.ts` with a shrinking known-violations ratchet.
- **Secrets hygiene.** No `.env` tracked in git; `JWT_SECRET` placeholder values rejected at boot; `CORS_ORIGIN: '*'` refused in production; WhatsApp tokens AES-256-GCM encrypted at rest.
- **Webhook and API security.** Meta HMAC verification, API keys stored hashed with scopes, per-key rate limiting, idempotency keys on the partner API.
- **Consultation audio access control.** Already moved off an unauthenticated static mount to signed, clinic-checked, expiring URLs.

The compliance work ahead is largely about **adding a governance layer** — consent, audit, retention, rights — on top of an engineering base that is sound. That is a much better position than the reverse.

---

*Prepared from source inspection at commit `0419b2a`. No claim of legal compliance is made or implied.*
