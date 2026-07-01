# core/mcp — Healthcare MCP (the "Setu" brain)

The **central brain** of the platform. It **routes and orchestrates** — it never
implements business logic. Products (ClinicBook, PatientLoop, NovaScribe) expose
**capabilities**; the brain decides which capability a request belongs to and
invokes it.

```
 channel (WhatsApp / Voice / Web / Mobile / API)
        │  receives + sends only, ZERO business logic
        ▼
   Healthcare MCP  ── route() ──►  intent → capability (data-driven)
        │  invoke()
        ▼
   product capability (ClinicBook / PatientLoop / NovaScribe)
        │  does the real work, reusing existing tested services
        ▼
   emits DomainEvent → core/events → subscribers (Reminder, Analytics, …)
```

## Rules

- **Channel-agnostic.** Every request enters as `McpContext` (who + where) + text
  or a capability name. WhatsApp is the first channel; Voice/Web/Mobile/API add a
  `McpChannel` value, not a new brain.
- **One patient identity.** `ctx.actor.patientId` is the single shared identity
  across all products. No product keeps its own patient table.
- **Core imports nothing from products.** Products register their capabilities at
  startup (see `products/*/*.capabilities.ts`), exactly like `core/events`
  subscriptions. Dependency inversion keeps `core` decoupled.
- **No duplicated logic.** A capability handler is a thin wrapper over an
  existing tested service (e.g. `appointment.book` → `createAppointment`).

## Entry points

- `invoke(ctx, name, input)` — **precise**: call a capability directly (dashboard,
  REST, cron, internal). Throws on unknown capability; handler errors propagate.
- `handle(ctx, text, input?)` — **forgiving**: the conversational path
  (classify → route → invoke). Never throws; returns `McpResult`.
- `setIntentClassifier(fn)` — inject NL understanding (Phase 3, backed by
  `core/ai`). Until wired, `handle` degrades gracefully to `intent: 'unknown'`.

## Note vs `integrations/mcp`

This is the **internal** brain. `integrations/mcp` is the (future) **external**
MCP-protocol adapter for outside partners (Practo, ABDM, HMIS) — it will reuse
*this* capability registry rather than re-implement anything.
