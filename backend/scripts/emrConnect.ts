// OpenEMR FHIR connection smoke test — READ ONLY. Verifies base URL + auth work
// and that our mappers understand the server's data, BEFORE you route any clinic
// to it. Nothing is written. Configure via env (in .env.local or inline):
//
//   OPENEMR_FHIR_BASE_URL=https://host/apis/default/fhir
//   # then EITHER a ready token:
//   OPENEMR_TOKEN=...
//   # OR OAuth2 password grant:
//   OPENEMR_CLIENT_ID=... OPENEMR_CLIENT_SECRET=... OPENEMR_USERNAME=...
//   OPENEMR_PASSWORD=... OPENEMR_SCOPE="openid offline_access api:fhir user/Practitioner.read user/Patient.read user/Slot.read"
//
//   npx tsx scripts/emrConnect.ts
import '../src/config/env.js';
import { FhirClient, HttpFhirTransport } from '../src/integrations/emr/fhir/fhirClient.js';
import { resolveOpenEmrToken } from '../src/integrations/emr/index.js';
import { openEmrDataSource } from '../src/integrations/emr/openemr/openEmrDataSource.js';
import type { FhirBundle } from '../src/integrations/emr/fhir/types.js';

async function main() {
  const baseUrl = process.env.OPENEMR_FHIR_BASE_URL;
  if (!baseUrl) {
    console.error('✗ OPENEMR_FHIR_BASE_URL is not set. See the header of this file.');
    process.exit(1);
  }
  const token = resolveOpenEmrToken(baseUrl);
  console.log(`FHIR base : ${baseUrl}`);
  console.log(`Auth      : ${token ? (typeof token === 'function' ? 'OAuth2 (password grant)' : 'static token') : 'NONE'}\n`);

  const insecureTls = process.env.OPENEMR_INSECURE_TLS === 'true';
  const client = new FhirClient(new HttpFhirTransport(baseUrl, token, { insecureTls }));

  // 1) Raw connectivity + auth: a trivial Practitioner search.
  try {
    const bundle = await client.search<{ resourceType: string }>('Practitioner', { _count: '5' });
    const n = (bundle as FhirBundle<unknown>).entry?.length ?? 0;
    console.log(`✓ Connected. Practitioner search returned ${n} entr${n === 1 ? 'y' : 'ies'} (total: ${(bundle as FhirBundle<unknown>).total ?? '?'}).`);
  } catch (e: any) {
    console.error('✗ Connectivity/auth failed:', e?.response?.status, e?.response?.statusText || e?.message);
    console.error('  Check the base URL, that the FHIR API is enabled, and the token/OAuth client + scopes.');
    process.exit(1);
  }

  // 2) Mapping: run the real adapter's reads so you see doctors/slots as
  //    ClinicBook would. clinicId here is only a label (read-only, unmapped).
  const ds = openEmrDataSource('smoke-test', client);
  try {
    const doctors = await ds.doctors.listRefs();
    console.log(`✓ Mapped ${doctors.length} doctor(s):`);
    for (const d of doctors.slice(0, 5)) console.log(`    - ${d.name} — ${d.speciality} (emr id ${d.id})`);

    if (doctors[0]) {
      const today = new Date().toISOString().slice(0, 10);
      const slots = await ds.slots.getAvailable(doctors[0].id, today);
      console.log(`✓ Free slots today for ${doctors[0].name}: ${slots.length ? slots.join(', ') : '(none / not scheduled)'}`);
    }
  } catch (e: any) {
    console.error('✗ Mapping/read failed:', e?.response?.status, e?.message);
    console.error('  Auth worked but a resource read/parse failed — check scopes (Practitioner/Slot) and data.');
    process.exit(1);
  }

  console.log('\n✓ Smoke test passed. This OpenEMR is ready to back a clinic (set OPENEMR_CLINICS=<clinicId>).');
  process.exit(0);
}

main().catch((e) => { console.error('ERR:', e); process.exit(1); });
