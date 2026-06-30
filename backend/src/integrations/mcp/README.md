# integrations/mcp — Healthcare MCP (placeholder)

The integration / communication layer to the OUTSIDE world (eSushrut, Practo,
Zenoti, other HMIS). NOT a user-facing product.

For now this lives inside the single backend as a module. Each product exposes
its capabilities as MCP-style "tools/actions" (e.g. `book_appointment`,
`create_soap_note`, `send_reminder`); this layer will wrap those for external
partners. Promote to a separate service only when real external partners and
traffic justify it.

Note: internal product-to-product communication does NOT need MCP — that goes
through `core/events`.
