import { notificationsRepo, usageRepo } from '../repositories/index.js';
import { newId } from './auth.js';
import type { NotificationType } from '../contracts/index.js';

// Fire-and-forget helpers used by the existing pipeline routes (transcribe,
// generate-report, save-consultation, patients) to feed the admin dashboard's
// usage analytics and notification feed. Never throw into the caller.

// The pipeline's own event kinds, plus whatever the phone app reports (a report
// exported, a recording that failed). Kept as a widened string rather than a
// closed union so a new client-side event never needs a backend release — the
// value is bounded and sanitised at the route before it reaches here.
export type UsageEventType = 'stt' | 'ai_report' | (string & {});

export async function logUsage(event: {
  type: UsageEventType;
  consultationId?: string;
  doctorId?: string;
  language?: string;
  durationMs?: number;
  sttConfidence?: number;
  success?: boolean;
  bytes?: number;
  /** Free-text context from a client-reported event (bounded by the caller). */
  detail?: string;
}): Promise<void> {
  try {
    await usageRepo.upsert({
      id: newId('use'),
      type: event.type,
      consultationId: event.consultationId || '',
      doctorId: event.doctorId || '',
      language: event.language || '',
      durationMs: event.durationMs || 0,
      sttConfidence: event.sttConfidence ?? -1,
      success: event.success ?? true,
      bytes: event.bytes || 0,
      detail: event.detail || '',
    });
  } catch (err) {
    console.error('[usage:log]', err);
  }
}

export async function pushNotification(
  type: NotificationType,
  title: string,
  message: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await notificationsRepo.upsert({
      id: newId('ntf'),
      type,
      title,
      message,
      read: false,
      meta,
    });
  } catch (err) {
    console.error('[notify:push]', err);
  }
}
