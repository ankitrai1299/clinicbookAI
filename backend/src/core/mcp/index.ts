// Public surface of the Healthcare MCP (the "Setu" brain). Import from here:
//   import { invoke, handle, capabilityRegistry } from '../../core/mcp/index.js';
//
// The brain ROUTES and ORCHESTRATES; it never implements business logic. Products
// register capabilities into `capabilityRegistry`; channels call `handle` (NL) or
// `invoke` (direct).

export { capabilityRegistry } from './capabilityRegistry.js';
export { invoke, handle } from './mcp.service.js';
export { route, classify, setIntentClassifier, hasIntentClassifier } from './mcp.router.js';
export type { RouteDecision } from './mcp.router.js';

// Multi-turn conversation surface (skills + brain-managed session).
export { skillRegistry } from './skillRegistry.js';
export { runConversation } from './conversation.js';
export type { ConversationResult } from './conversation.js';
export { isBrainEnabledFor } from './gate.js';
export type { Skill, SkillTurnResult, ConversationState } from './skill.types.js';
export type {
  Capability,
  CapabilityHandler,
  McpActor,
  McpChannel,
  McpContext,
  McpProduct,
  McpResult,
  IntentClassification,
  IntentClassifier
} from './mcp.types.js';
