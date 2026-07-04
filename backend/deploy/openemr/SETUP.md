# OpenEMR local sandbox → ClinicBook EMR integration (Phase 5)

Stand up a local OpenEMR, point ClinicBook's OpenEMR adapter at it, and book a
real appointment into it over WhatsApp/dashboard. Everything here is **local dev**
— production stays untouched (a clinic is only EMR-backed when `OPENEMR_CLINICS`
lists it, and the `ExternalIdMap` table has been pushed to the **local** DB only).

Prerequisite: Docker Desktop running.

---

## 1. Start OpenEMR

```bash
docker compose -f backend/deploy/openemr/docker-compose.yml up -d
# First boot auto-installs (5–10 min). Wait for "OpenEMR configuration complete!":
docker compose -f backend/deploy/openemr/docker-compose.yml logs -f openemr
```

Open <https://localhost:8310> (accept the self-signed cert) → log in `admin` / `AdminPass123!`.

## 2. Enable the APIs

OpenEMR → **Admin → Config → Connectors**, turn ON and save:
- **Enable OpenEMR Standard FHIR REST API**
- **Enable OAuth2 Password Grant**

## 3. Register an OAuth2 API client

```bash
curl -k -X POST https://localhost:8310/oauth2/default/registration \
 -H 'Content-Type: application/json' \
 -d '{
   "application_type":"private",
   "client_name":"ClinicBook AI",
   "token_endpoint_auth_method":"client_secret_post",
   "scope":"openid offline_access api:fhir user/Patient.read user/Patient.write user/Practitioner.read user/PractitionerRole.read user/Appointment.read user/Appointment.write user/Slot.read"
 }'
```

Save the returned `client_id` and `client_secret`.

Then **enable** the client (confidential clients must be admin-approved before the
password grant works): **Admin → System → API Clients** → *ClinicBook AI* → **Enable**.

## 4. Seed test data in OpenEMR

- Add a **Provider** (Practitioner) with a specialty.
- Add a **Patient**.
- Give the provider **calendar availability** so FHIR `Slot`s exist (Slots come from
  the provider's schedule; without it, `getAvailable` returns none).

## 5. Configure ClinicBook (backend/.env.local)

```dotenv
# which LOCAL clinic id is EMR-backed (find it in your local DB / dashboard)
OPENEMR_CLINICS=<localClinicId>
OPENEMR_FHIR_BASE_URL=https://localhost:8310/apis/default/fhir
OPENEMR_CLIENT_ID=<from step 3>
OPENEMR_CLIENT_SECRET=<from step 3>
OPENEMR_USERNAME=admin
OPENEMR_PASSWORD=AdminPass123!
OPENEMR_SCOPE=openid offline_access api:fhir user/Patient.read user/Patient.write user/Practitioner.read user/PractitionerRole.read user/Appointment.read user/Appointment.write user/Slot.read
OPENEMR_INSECURE_TLS=true   # LOCAL self-signed cert ONLY — never in prod
```

## 6. Smoke test (read-only, no clinic routed yet)

```bash
cd backend && npx tsx scripts/emrConnect.ts
```
Expect: `Connected`, your practitioner(s) listed, and free slots for today.

## 7. Go end-to-end

Start the backend (`cd backend && npm run dev`). Because `OPENEMR_CLINICS` lists the
clinic, its doctors/slots/patients now resolve from OpenEMR (shadow-mirrored to
local ids) and a booking writes a **FHIR Appointment** in OpenEMR **plus** a local
mirror row. Verify:
- the appointment appears in OpenEMR's calendar,
- `ExternalIdMap` has `appointment`/`patient`/`doctor` rows,
- reminders/dashboard still work (they read the local mirror).

---

## Notes

- **Production**: when you go live, run the guarded `prisma db push` of `ExternalIdMap`
  against prod (it was only pushed to local dev here), set the same env on the server
  (a real token/OAuth, **no** `OPENEMR_INSECURE_TLS`), and list only the real EMR
  clinic in `OPENEMR_CLINICS`. Every other clinic stays native.
- **Managed sandbox instead of Docker**: skip steps 1–4; set `OPENEMR_FHIR_BASE_URL`
  and either `OPENEMR_TOKEN=<bearer>` (static) or the OAuth vars above.
- OpenEMR FHIR specifics can vary by version; if a read fails, check the client's
  scopes and that the resource (Practitioner/Slot/Appointment) is enabled.
