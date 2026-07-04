// integrations/emr — plugs external-EMR data sources into the resolvers via
// dependency inversion (core + the clinicbook appointment resolver never import
// this). Called once at startup, like the capability/skill/event registrations.
// This is the OUTERMOST layer, so it may compose core + products together.
//
// Rollout is config-gated exactly like the platform's other strangler-fig gates
// (MCP_BRAIN_NUMBERS, WA_VOICE_TEST_NUMBERS). Two providers:
//   • EMR_MOCK_CLINICS — clinicIds served by the in-memory Mock EMR (demos/tests).
//   • OPENEMR_CLINICS  — clinicIds served by a real OpenEMR/FHIR endpoint
//                        (OPENEMR_FHIR_BASE_URL + OPENEMR_TOKEN).
// Blank (default) → nothing registered → every clinic stays fully native.
//
// EMR clinics are wrapped in syncThrough (local shadow mirror + local ids) so the
// booking FSM, reminders, analytics and dashboard keep working unchanged. OpenEMR
// clinics additionally get an EMR-backed appointment source (FHIR write + mirror).

import { registerExternalDataSource } from '../../core/datasource/index.js';
import { registerExternalAppointmentSource } from '../../products/clinicbook/appointments/appointmentSource.js';
import { nativeAppointments } from '../../products/clinicbook/appointments/appointment.native.js';
import { mockEmrDataSource } from './mock/mockEmrDataSource.js';
import { FhirClient, HttpFhirTransport, type TokenSource } from './fhir/fhirClient.js';
import { openEmrDataSource } from './openemr/openEmrDataSource.js';
import { openEmrAppointments } from './openemr/openEmrAppointments.js';
import { syncThroughDataSource } from './openemr/syncThrough.js';
import { createOpenEmrTokenProvider } from './openemr/openEmrAuth.js';

const parseList = (raw: string | undefined): string[] =>
  (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// Resolve how to authenticate to OpenEMR: a ready static token (managed sandbox)
// or an OAuth2 password-grant provider (self-hosted). Returns undefined if
// neither is configured (the transport then sends no Authorization).
export const resolveOpenEmrToken = (fhirBaseUrl: string): TokenSource | undefined => {
  if (process.env.OPENEMR_TOKEN) return process.env.OPENEMR_TOKEN;

  const clientId = process.env.OPENEMR_CLIENT_ID;
  const username = process.env.OPENEMR_USERNAME;
  const password = process.env.OPENEMR_PASSWORD;
  if (clientId && username && password) {
    const tokenUrl =
      process.env.OPENEMR_TOKEN_URL ?? fhirBaseUrl.replace(/\/apis\/[^/]+\/fhir\/?$/, '/oauth2/default/token');
    return createOpenEmrTokenProvider({
      tokenUrl,
      clientId,
      clientSecret: process.env.OPENEMR_CLIENT_SECRET,
      username,
      password,
      scope: process.env.OPENEMR_SCOPE ?? 'openid offline_access api:fhir',
      userRole: process.env.OPENEMR_USER_ROLE,
      insecureTls: process.env.OPENEMR_INSECURE_TLS === 'true'
    });
  }
  return undefined;
};

export const registerEmrIntegration = (): void => {
  // Mock EMR (in-memory) — read/patient/slot demo, wrapped in the shadow mirror
  // so a mock clinic behaves end-to-end like a real one. Appointment writes for
  // mock clinics stay native (no FHIR endpoint to write to).
  const mockClinics = parseList(process.env.EMR_MOCK_CLINICS);
  if (mockClinics.length > 0) {
    const set = new Set(mockClinics);
    registerExternalDataSource((clinicId) =>
      set.has(clinicId) ? syncThroughDataSource(clinicId, 'mock', mockEmrDataSource(clinicId)) : null
    );
    console.log(`[emr] Mock EMR active for clinic(s): ${mockClinics.join(', ')}`);
  }

  // Real OpenEMR (FHIR R4) — active only when a base URL + clinic list are set.
  const openEmrClinics = parseList(process.env.OPENEMR_CLINICS);
  const baseUrl = process.env.OPENEMR_FHIR_BASE_URL;
  if (openEmrClinics.length > 0 && baseUrl) {
    const set = new Set(openEmrClinics);
    const client = new FhirClient(new HttpFhirTransport(baseUrl, resolveOpenEmrToken(baseUrl)));
    // Reads (doctors/slots/patients) through the shadow mirror → local ids.
    registerExternalDataSource((clinicId) =>
      set.has(clinicId) ? syncThroughDataSource(clinicId, 'openemr', openEmrDataSource(clinicId, client)) : null
    );
    // Writes (appointments) to FHIR + local mirror.
    registerExternalAppointmentSource((clinicId) =>
      set.has(clinicId) ? openEmrAppointments(clinicId, 'openemr', client, nativeAppointments(clinicId)) : null
    );
    console.log(`[emr] OpenEMR (FHIR) active for clinic(s): ${openEmrClinics.join(', ')} @ ${baseUrl}`);
  }
};
