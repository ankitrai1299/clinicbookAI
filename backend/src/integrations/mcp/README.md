# integrations/mcp — EXTERNAL MCP adapter (placeholder)

The integration / communication layer to the OUTSIDE world (eSushrut, Practo,
Zenoti, other HMIS, ABDM). NOT a user-facing product.

**This is NOT the brain.** The platform brain — intent routing + orchestration
for internal channels (WhatsApp/Voice/Web/Mobile/API) — lives in
[`core/mcp`](../../core/mcp/README.md), which holds the capability registry.

This external adapter's future job is to expose that SAME capability registry
(`book_appointment`, `create_soap_note`, `send_reminder`, …) to outside partners
over the MCP protocol — it will reuse `core/mcp`, never re-implement routing or
business logic. Promote to a separate service only when real external partners
and traffic justify it.

Note: internal product-to-product reactions still flow through `core/events`;
internal request routing flows through `core/mcp`.
