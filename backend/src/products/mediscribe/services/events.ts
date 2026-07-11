import { notificationsRepo, usageRepo } from '../repositories/index.js';
import { newId } from './auth.js';
import type { NotificationType } from '../contracts/index.js';

// Fire-and-forget helpers used by the existing pipeline routes (transcribe,
// generate-report, save-consultation, patients) to feed the admin dashboard's
// usage analytics and notification feed. Never throw into the caller.

export async function logUsage(event: {
  type: 'stt' | 'ai_report';
  consultationId?: string;
  doctorId?: string;
  language?: string;
  durationMs?: number;
  sttConfidence?: number;
  success?: boolean;
  bytes?: number;
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
