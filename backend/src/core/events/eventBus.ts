// In-process, typed event bus — the loosely-coupled communication layer between
// products inside this single backend.
//
//   eventBus.on('appointment.completed', handler)   // subscribe
//   eventBus.emit('appointment.completed', payload)  // publish (fire-and-forget)
//
// Design guarantees:
//  - FIRE-AND-FORGET: emit() returns immediately and never awaits handlers, so a
//    slow subscriber can't delay the HTTP request that published the event.
//  - ISOLATION: each handler runs in its own try/catch; one throwing (sync or
//    async) never affects other handlers or the emitter. Failures are logged.
//  - TYPED: event name and payload are checked against DomainEventPayloads.
//
// It is deliberately a simple in-memory emitter. When a product is later
// extracted into its own service, swap this single module for a real broker
// (Redis/BullMQ) — product code that calls on()/emit() does not change.

import type {
  DomainEventName,
  DomainEventPayloads,
  DomainEventHandler
} from './events.types.js';

type AnyHandler = (payload: unknown) => void | Promise<void>;

class EventBus {
  private handlers = new Map<DomainEventName, Set<AnyHandler>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<E extends DomainEventName>(event: E, handler: DomainEventHandler<E>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as AnyHandler);
    return () => {
      this.handlers.get(event)?.delete(handler as AnyHandler);
    };
  }

  /**
   * Publish an event. Returns immediately; handlers run fire-and-forget and are
   * isolated — a throwing/rejecting handler is logged, never propagated.
   */
  emit<E extends DomainEventName>(event: E, payload: DomainEventPayloads[E]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) {
      return;
    }
    // Snapshot so a handler that (un)subscribes during dispatch can't mutate the
    // set we're iterating.
    for (const handler of [...set]) {
      try {
        void Promise.resolve(handler(payload)).catch((err) =>
          console.error(`[events] async handler for "${event}" failed:`, err)
        );
      } catch (err) {
        console.error(`[events] handler for "${event}" threw synchronously:`, err);
      }
    }
  }

  /** Number of subscribers for an event (used by tests). */
  handlerCount(event: DomainEventName): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /** Remove all subscribers (used by tests). */
  clear(): void {
    this.handlers.clear();
  }
}

// Single shared instance for the whole process.
export const eventBus = new EventBus();
