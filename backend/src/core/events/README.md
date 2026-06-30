# core/events — Internal Event Bus (placeholder)

Loosely-coupled communication between products inside this single backend.

Products MUST NOT import each other directly. Instead:
- A product `emit`s a domain event (e.g. `appointment.completed`, `prescription.created`).
- Other products `subscribe` and react.

This keeps `core` independent of `products`, and lets any product later be
extracted into its own service by swapping this in-process bus for a queue
(Redis/BullMQ) without touching product code.

First real use cases:
- `appointment.completed`  → NovaScribe (start consultation note)
- `prescription.created`   → PatientLoop (schedule medicine reminders)
- channel `whatsapp.inbound.received` → ClinicBook booking FSM
  (this last one is what will let us move booking logic out of core/whatsapp)
