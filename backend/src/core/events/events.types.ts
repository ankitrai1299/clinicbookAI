// Typed catalogue of internal domain events. This is the CONTRACT between
// products: a product emits an event here, other products subscribe — neither
// imports the other. Adding a cross-product reaction = add an event below and
// subscribe to it; never import one product from another.
//
// Payloads are intentionally small + serialisable (ids + display names), never
// whole ORM rows, so a subscriber re-reads what it needs through its own
// tenant-scoped client. clinicId is mandatory on every event: subscribers are
// multi-tenant and must scope their work to the originating clinic.

export interface DomainEventPayloads {
  // Emitted by ClinicBook when a consultation is marked COMPLETED (post-visit
  // workflow). NovaScribe subscribes to open a draft consultation note.
  'appointment.completed': {
    clinicId: string;
    appointmentId: string;
    patientId?: string;
    doctorId?: string;
    patientName?: string;
    doctorName?: string;
  };

  // Emitted by NovaScribe when a doctor approves & locks a consultation note.
  // PatientLoop will subscribe (later) to schedule medicine reminders.
  'consultation.finalized': {
    clinicId: string;
    consultationNoteId: string;
    patientId?: string;
  };
}

export type DomainEventName = keyof DomainEventPayloads;

export type DomainEventHandler<E extends DomainEventName> = (
  payload: DomainEventPayloads[E]
) => void | Promise<void>;
