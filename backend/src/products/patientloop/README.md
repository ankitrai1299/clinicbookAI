# products/patientloop — Patient Engagement (placeholder)

WhatsApp medicine + appointment reminders, plain-language explanation of lab
reports / prescriptions, daily "how are you feeling?" check-ins, and family
updates.

Dependencies (import from `core`, never from other products):
- core/patients                  (shared patient record)
- core/channels → core/whatsapp  (shared WhatsApp sender)
- core/tenant                    (clinicId scoping)

Reacts to `core/events` (e.g. `prescription.created` from NovaScribe,
`appointment.booked` from ClinicBook). Bulk daily messaging must run as
background jobs, respecting the WhatsApp 24h window / approved templates.

Dashboard: reuses the ClinicBook frontend theme (same look & feel).
