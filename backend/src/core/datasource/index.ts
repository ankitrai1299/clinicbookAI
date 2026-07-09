// The data-source RESOLVER — the single entry point the app uses to reach a
// clinic's doctors/slots/patients without knowing where they physically live.
// Callers do `dataSourceFor(clinicId).doctors.list()` instead of touching Prisma.
//
// Native (Prisma) is the default. An external source (OpenEMR/Epic/Practo, under
// integrations/emr) is plugged in via dependency inversion: integrations
// REGISTERS a provider at startup — core never imports integrations, exactly
// like capabilities/events. For a clinic the provider claims, its ClinicDataSource
// is used; otherwise the native source. No caller changes when a clinic's
// records move to an external HMIS.

import type { ClinicDataSource } from './ports.js';
import { nativeDataSource } from './native/index.js';

// A provider decides whether it owns a clinic's data and, if so, returns that
// clinic's external ClinicDataSource. Returning null means "not mine — fall
// through" (to the next provider, ultimately native).
export type ExternalDataSourceProvider = (clinicId: string) => ClinicDataSource | null;

const providers: ExternalDataSourceProvider[] = [];

// Called once at startup by integrations/emr to plug external sources in.
export const registerExternalDataSource = (provider: ExternalDataSourceProvider): void => {
  providers.push(provider);
};

// Test/lifecycle helper: drop all registered external providers.
export const clearExternalDataSources = (): void => {
  providers.length = 0;
};

export const dataSourceFor = (clinicId: string): ClinicDataSource => {
  for (const provider of providers) {
    const external = provider(clinicId);
    if (external) return external;
  }
  return nativeDataSource(clinicId);
};

export type { ClinicDataSource, DoctorPort, SlotPort, PatientPort, DoctorRef } from './ports.js';
