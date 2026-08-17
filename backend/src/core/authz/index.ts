// Authorization: one permission matrix, enforced server-side.
//
// See permissions.ts for who may do what, roles.ts for how the two existing role
// vocabularies map onto one, and requirePermission.ts for enforcement.

export { PERMISSIONS, ROLE_PERMISSIONS, hasPermission, type Permission } from './permissions.js';
export { PLATFORM_ROLES, platformRoleOf, asPlatformRole, effectiveRole, type PlatformRole } from './roles.js';
export { requirePermission, assertPermission, resolveActingRole, type RoleResolver } from './requirePermission.js';
