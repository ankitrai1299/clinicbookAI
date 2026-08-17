# Incident Response — ClinicBook AI + MediScribe

**This page is written to be read at 11pm by one tired person.** Follow it top to bottom. Do not read the rest of the compliance folder first.

> **The clock: CERT-In requires certain cyber incidents to be reported within SIX HOURS of being *noticed*.** Noticed, not confirmed. The moment you believe something might be real, the clock has started — so the first hour goes to containing and reporting, not to being certain.

---

## 0. Fill this in before you need it

These are the only blanks. Filling them takes ten minutes and is the difference between this page working and not.

| | |
|---|---|
| **Incident lead** (decides, and is woken) | `___________________` |
| **Backup lead** | `___________________` |
| **Phone numbers** | `___________________` |
| **CERT-In point of contact** (filed with CERT-In) | `___________________` |
| **Grievance officer / DPO** (named in the privacy notice) | `___________________` |
| **Lawyer** (data protection) | `___________________` |
| **Railway account owner** (can rotate DB credentials) | `___________________` |
| **Where alerts arrive** (`SECURITY_ALERT_EMAIL`) | `___________________` |

**CERT-In reporting:** `incident@cert-in.org.in` · https://www.cert-in.org.in (verify the current channel and form before an incident, not during one)

---

## 1. How you will find out

| Source | What it looks like |
|---|---|
| **Automated alert email** | Subject `[HIGH] ClinicBook security alert: <rule>`. Written by the scan that runs every 10 minutes over the audit trail. |
| **Application log** | `[security][high]` lines. Same events, in Railway's logs. |
| **The dashboard** | Security alerts list, `GET /api/security/alerts` (clinic admins). |
| **A person** | A clinic says "someone else saw our patients", a doctor says "I did not delete that". **Treat this exactly like an automated alert.** |

The five patterns that alert automatically, and what each usually means:

| Rule | Usually |
|---|---|
| `failed_logins` | Password guessing against one account. **High** if from several addresses. |
| `denials` | An account walking the API for things it may not reach — or a role change nobody told the user about. |
| `patient_sweep` | One account opened many different patient records in minutes. **This is the exfiltration shape.** |
| `recording_sweep` | One account played several consultation recordings in minutes. |
| `destructive_burst` | Several deletions by one account. Often a mistake in progress. |

---

## 2. First 15 minutes — contain

Do these in order. Do not investigate first.

1. **Is patient data still leaving right now?** If an account is sweeping records, end it:
   - Dashboard → Security → **Sign out everywhere** on that account, or
   - Bump the user's `tokenVersion` directly. Every token they hold dies within 60 seconds.
2. **If a device or app password is implicated** — revoke it (Security → Device passwords → Revoke). That also ends every session on the account.
3. **If a partner API key is implicated** — Developers & API → revoke it. Revocation is immediate.
4. **If you suspect the database or the host itself** — rotate `DATABASE_URL`, `JWT_SECRET` and `WA_CHANNEL_ENC_KEY` on Railway. **Rotating `JWT_SECRET` signs every user out everywhere**, which is correct in this situation.
5. **Write down the time you first noticed.** This is the start of the six-hour clock and it goes in the report. Do it now, before you forget.

**Do not delete anything.** Not logs, not the alert, not the account. Deleting evidence is its own problem, and the audit trail is hash-chained — gaps are visible.

---

## 3. Next 45 minutes — establish scope

Answer these four questions. You do not need certainty; you need a defensible current understanding.

**Who?** — `GET /api/audit?actorId=<id>` around the window.
**Which patients?** — `GET /api/audit?patientId=<id>`, or the `detail.distinctPatients` count on the alert.
**What did they reach?** — actions in the trail: `PATIENT_VIEWED`, `RECORDING_ACCESSED`, `DOCUMENT_DOWNLOADED` are reads; `*_DELETED` and `*_UPDATED` are changes.
**Is the trail itself intact?** — `GET /api/audit/verify`. Any `content-altered` or `broken-link` finding means someone reached the database directly, which changes the severity of everything above.

Record the answers in the register (§6) as you go. You will not remember them tomorrow.

---

## 4. Is it reportable?

Two separate obligations. They have different triggers, different deadlines, and different recipients — an incident can require one, both, or neither.

### CERT-In — within 6 hours of noticing

Report if it is a cyber incident. When in doubt, report: the cost of a report that turns out to be nothing is an email; the cost of a missed one is not.

Reportable includes — unauthorised access to data, data breach or leak, identity theft, compromised systems or accounts, malicious code, denial of service, attacks on servers or applications.

**Send:** time noticed, what happened, systems affected, current status, what you have done, and your contact details. A short, honest, incomplete report inside six hours beats a complete one at nine.

### DPDP — the Board, and the affected patients

If personal data was breached, notify the Data Protection Board and the affected Data Principals **without delay**. The Rules set out the form and the follow-up detail.

> ⚖️ **Who sends this depends on whether you or the clinic is the Data Fiduciary — the §2 question in the compliance audit that is still open.** Settle it before an incident, not during one. Until it is settled, notify your lawyer immediately and act as though the obligation is yours.

### Also consider

The affected **clinics** (contractually, almost certainly immediately), and **Meta / Sarvam / OpenAI** if the exposure ran through them.

---

## 5. After — close it out

- Revoke and re-issue anything that was exposed.
- Write the resolution into the alert (Security → Acknowledge). Say what you concluded, including "false alarm, receptionist's role had changed" — that is a real finding and the next person needs it.
- Update the register (§6).
- **One question, always:** what would have made this visible sooner, or impossible? Then do that thing.

---

## 6. Breach register

Every incident, including the ones that turned out to be nothing. Kept because "have you had a breach?" is asked by every enterprise customer, every insurer, and eventually a regulator — and "we don't think so" is not an answer.

| # | Noticed (IST) | How found | What happened | Data involved | Patients affected | Contained at | CERT-In | DPDP Board | Patients told | Closed | Lead |
|---|---|---|---|---|---|---|---|---|---|---|---|
| _(none yet)_ | | | | | | | | | | | |

---

## 7. Practise it once

A runbook nobody has walked through is a document, not a plan. Do this once, with the people named in §0, and keep it to an hour.

**Scenario.** 15:40 on a Tuesday. An email arrives: `[HIGH] patient_sweep — One account opened 47 different patient records in a few minutes.` The account belongs to a receptionist who is on leave this week.

Walk it: who is called first, who ends the session, who writes down the time, who decides on CERT-In, who tells the clinic. Time each step.

**What the exercise is for:** finding out that a phone number is wrong, that nobody knows the Railway password, or that two people each thought the other was reporting. It always finds at least one of those. Fix what it finds and note the date here:

**Last exercise:** `___________`

---

## What this system already does for you

Worth knowing, because it changes what you have to do by hand:

- **Every sensitive action is recorded** — who, what, which patient, when, from where (Phase 2). Reads as well as writes.
- **The audit trail is hash-chained**, so tampering below the application is detectable (`GET /api/audit/verify`).
- **Sessions can be ended centrally** — one action kills every token an account holds, within 60 seconds (Phase 3).
- **Nothing clinical is in the logs or the alerts** — masked phone numbers, counts, ids. You can share an alert email with an engineer without sharing a medical record.
- **Alerts cannot be deleted**, only closed with a written reason.

## What it does not do — do not assume otherwise

- **Log retention.** Application logs live in Railway on Railway's schedule. CERT-In expects 180 days, within India; the DPDP Rules expect a year. **Not yet solved.**
- **Clock sync.** CERT-In expects NTP sync to NIC/NPL. A container cannot set its own clock — this is a hosting control to confirm with Railway.
- **Nothing watches the infrastructure.** These rules read the application's own audit trail. A compromise that never touches the API — direct database access, a leaked Railway credential — produces no alert here. `GET /api/audit/verify` is the check that would show it after the fact.
- **One replica.** Session revocation is cached for 60 seconds per instance. Correct today (`numReplicas: 1`); revisit if that changes.

---

*Phase 5 of the India compliance programme. See `INDIA_COMPLIANCE_AUDIT.md` for the full picture, and §8 there for what still needs a lawyer.*
