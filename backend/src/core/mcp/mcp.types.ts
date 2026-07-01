// ===========================================================================
// Healthcare MCP — shared types (the "Setu" brain contract).
//
// The MCP is the CENTRAL BRAIN of the platform: it routes and orchestrates,
// it never implements business logic. Products (ClinicBook, PatientLoop,
// NovaScribe) expose CAPABILITIES; the brain decides which capability a request
// belongs to and invokes it. The brain must stay CHANNEL-AGNOSTIC: WhatsApp is
// the first channel, but Voice AI, Website Chat, Mobile App and External APIs
// will all enter through the same brain with the same context shape.
//
// Layering rule (same as core/events): this module lives in `core` and imports
// NOTHING from `products`. Products depend inward on the brain and REGISTER
// their capabilities at startup — dependency inversion keeps core decoupled.
// ===========================================================================

// Every surface a request can arrive from. Add a channel here, not a new brain.
export type McpChannel =
  | 'whatsapp'
  | 'voice'
  | 'web'
  | 'mobile'
  | 'api'
  | 'dashboard'
  | 'system';

// Which product owns a capability. Purely for routing/observability — the brain
// treats all capabilities uniformly.
export type McpProduct = 'clinicbook' | 'patientloop' | 'novascribe' | 'core';

// WHO is making the request, resolved to platform identities. There is ONE
// patient identity shared across all products — a capability reads `patientId`
// from here and never re-derives it from a channel-specific id.
export interface McpActor {
  kind: 'patient' | 'staff' | 'system';
  patientId?: string;
  userId?: string;
  // Raw channel identity before resolution (e.g. a WhatsApp phone number).
  externalId?: string;
  displayName?: string;
}

// The channel-agnostic envelope every capability receives. It carries WHO and
// WHERE, never WHAT-to-do (that is the capability's job).
export interface McpContext {
  clinicId: string;
  channel: McpChannel;
  actor: McpActor;
  locale?: string;
  // Free-form per-channel metadata (phone, message id, etc.). Never business logic.
  meta?: Record<string, unknown>;
}

export type CapabilityHandler<Input = unknown, Output = unknown> = (
  ctx: McpContext,
  input: Input
) => Promise<Output> | Output;

// A single action a product exposes to the brain. Products register these at
// boot; the brain only routes to them and never re-implements their logic.
export interface Capability<Input = any, Output = any> {
  // Stable, namespaced id, e.g. "appointment.book", "reminder.schedule".
  name: string;
  product: McpProduct;
  description: string;
  // Coarse conversational INTENTS this capability fulfils (e.g. ['book']). The
  // router builds intent → capability from these, so the brain never hardcodes
  // which product handles which intent. Omit for capabilities only called
  // directly (invoke) and never reached via natural language.
  intents?: string[];
  handler: CapabilityHandler<Input, Output>;
}

// Forgiving result shape returned by the conversational `handle()` path. A
// patient must ALWAYS get a reply, so this never throws — failures come back as
// `ok:false` with a message the channel can relay.
export interface McpResult<Data = unknown> {
  ok: boolean;
  capability: string | null;
  intent?: string;
  data?: Data;
  error?: string;
}

// Natural-language understanding is pluggable so the brain (core) does not have
// to import the AI service directly. Phase 3 injects a classifier backed by
// core/ai via `setIntentClassifier`.
export interface IntentClassification {
  intent: string;
  confidence?: number;
  // Extracted slots the classifier resolved (speciality, date phrase, etc.).
  slots?: Record<string, unknown>;
}

export type IntentClassifier = (
  ctx: McpContext,
  text: string
) => Promise<IntentClassification> | IntentClassification;
