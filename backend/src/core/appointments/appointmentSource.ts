// Resolver for a clinic's appointment data source. Mirrors core/datasource: an
// external provider (OpenEMR, under integrations/emr) is plugged in via
// dependency inversion — this product module never imports integrations. For a
// clinic the provider claims, its AppointmentPort is used (EMR write + local
// mirror); otherwise the native Postgres port. Native stays the default, so a
// clinic is only EMR-backed when its config explicitly enables it.

import type { AppointmentPort } from './appointment.port.js';
import { nativeAppointments } from './appointment.native.js';

export type ExternalAppointmentProvider = (clinicId: string) => AppointmentPort | null;

const providers: ExternalAppointmentProvider[] = [];

// Called once at startup by integrations/emr to plug an EMR appointment source in.
export const registerExternalAppointmentSource = (provider: ExternalAppointmentProvider): void => {
  providers.push(provider);
};

// Test/lifecycle helper: drop all registered external providers.
export const clearExternalAppointmentSources = (): void => {
  providers.length = 0;
};

export const appointmentSourceFor = (clinicId: string): AppointmentPort => {
  for (const provider of providers) {
    const external = provider(clinicId);
    if (external) return external;
  }
  return nativeAppointments(clinicId);
};
