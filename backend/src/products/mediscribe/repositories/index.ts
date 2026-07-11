// One repository per collection, backed by the shared Postgres NovaDoc store
// (see baseRepository.ts) and scoped to the current request's clinic. Routes use
// these instead of touching the persistence layer directly, so the store stays
// swappable — exactly as in the reference app.

import { createRepository } from './baseRepository.js';

export const patientsRepo = createRepository('patients');
export const consultationsRepo = createRepository('consultations');
export const transcriptsRepo = createRepository('transcripts');
export const reportsRepo = createRepository('reports');
export const prescriptionsRepo = createRepository('prescriptions');

// Admin-dashboard collections.
export const usersRepo = createRepository('users');
export const hospitalsRepo = createRepository('hospitals');
export const settingsRepo = createRepository('settings');
export const notificationsRepo = createRepository('notifications');
export const usageRepo = createRepository('usage_events');
