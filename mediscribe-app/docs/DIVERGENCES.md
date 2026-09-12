# Divergences from the reference app

This app is reproduced **byte-for-byte** from its reference. That rule has been
kept everywhere except the list below.

Each entry exists because the reference could not have anticipated it, and each
was approved individually. **If this app is ever re-copied from the reference,
every item here must be re-applied** — that is the whole reason this file
exists, because the failure mode is silent: the app still builds, still runs,
and simply stops doing the thing.

---

## 1. Backend and project identity

| File | Change | Why |
|---|---|---|
| `eas.json` | `EXPO_PUBLIC_API_URL` → the ClinicBook Railway backend | The reference pointed at its own server. This app runs on the ClinicBook platform and shares its login. |
| `app.json` | `extra.eas.projectId`, `owner` | So it builds under this EAS account. |
| `.env` | not copied | The reference's own secrets are not ours. |

## 2. Push notifications — added 18 Aug 2026

**Approved explicitly**, after the alternative (moving doctors onto the WebView
shell) was weighed and rejected because it would have changed the report layout
and the recording feel — the two things this app exists to preserve exactly.

The reference has no notion of a server that pushes to it, so a doctor learned
about a new appointment only by opening the app. Everything else about this app
is faithful; being silent when a patient books is not a design decision worth
preserving.

**Touch points — all five must be re-applied after any re-copy:**

| File | Change |
|---|---|
| `src/services/push.ts` | **New file.** Permission, Expo token, register/unregister with the backend. |
| `src/context/Auth.tsx` | One import; `void registerForPush()` at the end of `adoptSession`; `await unregisterFromPush()` at the top of `clearSession`. |
| `package.json` | `expo-notifications`, `expo-device` — both installed via `npx expo install`, so they match SDK 54 and no other version moved. |
| `app.json` | `android.permissions` gains `android.permission.POST_NOTIFICATIONS`. |
| `app.config.js` | **New file.** Resolves `googleServicesFile` from an EAS file environment variable. Every other value still comes from `app.json`, untouched. |
| — | Nothing else. No screen, no navigation, no report code was touched. |

**Why `app.config.js` exists at all:** this repository is public, so the Firebase
config is not committed — and EAS Build uploads only git-tracked files, so a
gitignored file is simply absent when the build runs. That is how the first FCM
build failed. The file is supplied as an EAS **file** environment variable
(`GOOGLE_SERVICES_JSON`), which the builder writes to a temporary path; the
config reads that path. Locally the variable is unset and a developer's own copy
is used.

**Why `adoptSession` and `clearSession` specifically:** every route into a
session (login, register, password reset, and the on-mount restore) passes
through `adoptSession`, and every route out passes through `clearSession`. One
place each, rather than four and four.

**Unregistering on sign-out is not optional.** A clinic phone is shared; without
it the next doctor to pick it up receives the previous one's appointment
notifications.

### Delivery depends on something outside this repo

Push needs **FCM credentials on the EAS project**, for the Android package
`com.nextdot.novascribeai`. Without them `getExpoPushTokenAsync` fails, the app
logs a warning and carries on working normally — no notifications, no crash.

The ClinicBook app is a **different package** (`com.nextdot.clinicbookai`) and
needs its **own** Firebase Android app. One is not enough for both.

---

## The booked day on the dashboard (12 Sep 2026)

**This is a screen change, and the rule above says screens are not touched. It
was taken deliberately, and here is the reason.**

ClinicBook takes the booking; this app writes the note. The two halves had never
met: a patient booked over WhatsApp appeared NOWHERE in this app. The doctor was
told out loud that somebody was coming, then opened "New Consultation" and found
or re-typed a patient the system already knew about. The web scribe has had the
queue for months; the Android app, which is what doctors actually carry, did not
— and that gap cost two rounds of "the doctor can't see the booking", each of
which looked like a bug in the backend and was not.

What was added, and nothing else:

- `src/services/api.ts` — `getUpcomingAppointments()` and `getDoctorLinkStatus()`
  against `/api/doctor/appointments/*`. Both swallow failure and return a safe
  default: an unreachable network must leave the dashboard standing.
- `app/(tabs)/index.tsx` — two sections between the hero and Practice Overview:
  **Today's Queue** (tap starts a session already attached to that patient) and
  a read-only **Upcoming Appointments**. Plus a warning when the login matches no
  doctor record, because an empty queue and a broken link look identical and only
  one of them is the doctor's fault.

No new dependency, no navigation change, no restyling, and the printed report is
untouched. Strings go through `t(key, 'English default')` so untranslated locales
read English rather than a raw key.

Backend: none needed. `/api/doctor` and `/api/mediscribe` are the same router, so
these routes already existed and already scope themselves to the signed-in
doctor. Verified live against production before shipping.

---

## What has NOT been changed, and must not be

- **The printed report.** Untouched. It is the most fragile part of this app and
  the reason the byte-for-byte rule exists.
- Navigation, styling, fonts, spacing. (Screens: one, above, with its reason.)
- Any dependency version. Both additions came from `npx expo install`, which
  resolves against the pinned SDK rather than the latest.
