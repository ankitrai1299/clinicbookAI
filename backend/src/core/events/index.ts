// Public surface of the internal event bus. Import from here:
//   import { eventBus } from '../../core/events/index.js';
export { eventBus } from './eventBus.js';
export type {
  DomainEventName,
  DomainEventPayloads,
  DomainEventHandler
} from './events.types.js';
