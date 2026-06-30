# products/novascribe — Doctor's AI Assistant (placeholder)

Listens to doctor↔patient consultation audio, transcribes it (Whisper/STT),
drafts a SOAP note and prescription. Doctor reviews, then it's saved.

Dependencies (import from `core`, never from other products):
- core/patients, core/doctors, core/clinics  (shared records)
- core/ai                                     (LLM/STT wrapper)
- core/tenant                                 (clinicId scoping)

Cross-product reactions go through `core/events` (e.g. emit
`prescription.created` for PatientLoop). Heavy audio work must run as a
background job, not in the request cycle.

Dashboard: reuses the ClinicBook frontend theme (same look & feel).
