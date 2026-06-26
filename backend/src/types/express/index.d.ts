import type { TenantClient } from '../../config/tenantPrisma.js';

export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        clinicId: string;
        email: string;
        role: string;
      };
      // Set by the resolveTenant middleware (after requireAuth). The resolved
      // tenant and a Prisma client locked to it. Handlers use these instead of
      // importing the global prisma + hand-threading clinicId.
      clinic?: {
        id: string;
      };
      db?: TenantClient;
    }
  }
}