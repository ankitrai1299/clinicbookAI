// The capability registry — the brain's directory of "what can be done and who
// does it". Products register their capabilities here at startup (see each
// product's *.capabilities.ts). The brain reads from it to route requests; it
// never imports products directly.
//
// Mirrors the eventBus design: a simple in-memory singleton now, swappable for a
// distributed registry when products are extracted into their own services —
// callers of register()/get()/resolveIntent() do not change.

import type { Capability } from './mcp.types.js';

class CapabilityRegistry {
  private caps = new Map<string, Capability>();
  // intent → capability name. Built from Capability.intents at registration.
  private intentIndex = new Map<string, string>();

  /**
   * Register a capability. Throws on a duplicate name or a conflicting intent
   * claim — both are configuration bugs we want to fail fast on at boot, not
   * discover as silent mis-routing in production.
   */
  register(cap: Capability): void {
    if (this.caps.has(cap.name)) {
      throw new Error(`[mcp] capability "${cap.name}" is already registered`);
    }
    this.caps.set(cap.name, cap);

    for (const intent of cap.intents ?? []) {
      const existing = this.intentIndex.get(intent);
      if (existing && existing !== cap.name) {
        throw new Error(
          `[mcp] intent "${intent}" is already routed to "${existing}", cannot also route to "${cap.name}"`
        );
      }
      this.intentIndex.set(intent, cap.name);
    }
  }

  get(name: string): Capability | undefined {
    return this.caps.get(name);
  }

  has(name: string): boolean {
    return this.caps.has(name);
  }

  /** The capability name that fulfils a coarse intent, or undefined. */
  resolveIntent(intent: string): string | undefined {
    return this.intentIndex.get(intent);
  }

  list(): Capability[] {
    return [...this.caps.values()];
  }

  /** Remove everything (used by tests). */
  clear(): void {
    this.caps.clear();
    this.intentIndex.clear();
  }
}

// Single shared instance for the whole process.
export const capabilityRegistry = new CapabilityRegistry();
