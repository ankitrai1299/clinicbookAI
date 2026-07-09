// Bridges the internal event bus to the outbound-webhook OUTBOX.
//
// The bus is deliberately fire-and-forget (see core/events/eventBus.ts): a handler
// that threw or blocked would harm the emitting path. So a handler here does the
// smallest durable thing — INSERT one WebhookDelivery row per subscribed endpoint
// — and the cron owns the HTTP, the retries and the giving-up. A partner being
// down, or a deploy landing mid-emit, delays delivery instead of losing it.
//
// Registered once at startup, like the NovaScribe subscriptions.

import { prisma } from '../../config/prisma.js';
import { eventBus } from '../events/index.js';
import type { DomainEventName, DomainEventPayloads } from '../events/events.types.js';
import { DELIVERABLE_EVENTS } from './webhook.service.js';

const enqueue = async <E extends DomainEventName>(
  event: E,
  payload: DomainEventPayloads[E]
): Promise<void> => {
  const { clinicId } = payload;
  if (!clinicId) return;

  // Raw client: this is a cross-cutting subscriber, and we scope by the event's
  // own clinicId (the same discipline the reminder/waitlist crons use).
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { clinicId, enabled: true, events: { has: event } },
    select: { id: true }
  });
  if (endpoints.length === 0) return;

  await prisma.webhookDelivery.createMany({
    data: endpoints.map((e) => ({
      clinicId,
      endpointId: e.id,
      event,
      payload: { event, data: payload }
    }))
  });
};

let registered = false;

export const registerWebhookSubscriptions = (): void => {
  // Idempotent: createApp may run more than once (e.g. across tests).
  if (registered) return;
  registered = true;

  for (const event of DELIVERABLE_EVENTS) {
    eventBus.on(event, (payload) => {
      // Never let a webhook problem surface in the emitting path.
      void enqueue(event, payload).catch((err: unknown) =>
        console.error(`[webhook] failed to enqueue "${event}":`, err)
      );
    });
  }
  console.info(`[webhook] subscribed to: ${DELIVERABLE_EVENTS.join(', ')}`);
};
