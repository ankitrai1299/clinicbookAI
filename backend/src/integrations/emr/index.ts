// integrations/emr — plugs external-EMR data sources into the core resolver via
// dependency inversion (core never imports this). Called once at startup, like
// the capability/skill/event registrations.
//
// Rollout is config-gated exactly like the platform's other strangler-fig gates
// (MCP_BRAIN_NUMBERS, WA_VOICE_TEST_NUMBERS). Two providers:
//   • EMR_MOCK_CLINICS   — clinicIds served by the in-memory Mock EMR (demos/tests).
//   • OPENEMR_CLINICS     — clinicIds served by a real OpenEMR/FHIR endpoint
//                           (OPENEMR_FHIR_BASE_URL + OPENEMR_TOKEN).
// Blank (default) → nothing registered → every clinic stays native. A real
// multi-endpoint deployment maps each clinicId to its own base URL/token; here a
// single endpoint backs all listed clinics for a first pilot.

import { registerExternalDataSource } from '../../core/datasource/index.js';
import { mockEmrDataSource } from './mock/mockEmrDataSource.js';
import { FhirClient, HttpFhirTransport } from './fhir/fhirClient.js';
import { openEmrDataSource } from './openemr/openEmrDataSource.js';

const parseList = (raw: string | undefined): string[] =>
  (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const registerEmrIntegration = (): void => {
  // Mock EMR (in-memory) — for demos and local verification.
  const mockClinics = parseList(process.env.EMR_MOCK_CLINICS);
  if (mockClinics.length > 0) {
    const set = new Set(mockClinics);
    registerExternalDataSource((clinicId) => (set.has(clinicId) ? mockEmrDataSource(clinicId) : null));
    console.log(`[emr] Mock EMR active for clinic(s): ${mockClinics.join(', ')}`);
  }

  // Real OpenEMR (FHIR R4) — active only when a base URL + clinic list are set.
  const openEmrClinics = parseList(process.env.OPENEMR_CLINICS);
  const baseUrl = process.env.OPENEMR_FHIR_BASE_URL;
  if (openEmrClinics.length > 0 && baseUrl) {
    const set = new Set(openEmrClinics);
    const client = new FhirClient(new HttpFhirTransport(baseUrl, process.env.OPENEMR_TOKEN));
    registerExternalDataSource((clinicId) => (set.has(clinicId) ? openEmrDataSource(clinicId, client) : null));
    console.log(`[emr] OpenEMR (FHIR) active for clinic(s): ${openEmrClinics.join(', ')} @ ${baseUrl}`);
  }
};
