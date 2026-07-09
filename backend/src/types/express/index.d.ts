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
      // Set by requireApiKey on the PUBLIC /api/v1 channel — the partner key
      // that resolved this request's tenant (same clinic/db shape as above).
      // For a TEST key, `clinicId` is the SANDBOX clinic's id, which is what makes
      // tenant scoping do the isolation work.
      apiKey?: {
        id: string;
        clinicId: string;
        mode: 'LIVE' | 'TEST';
        scopes: Array<'read' | 'write'>;
      };
    }
  }
}