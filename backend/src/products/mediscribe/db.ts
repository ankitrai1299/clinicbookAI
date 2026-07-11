// The reference app owned its own MongoDB connection here. In the ClinicBook
// port there is a single shared Postgres connection (config/prisma), always live,
// so these are thin shims that keep the ported call sites (`await connectDB()`,
// `isConnected()`) compiling and behaving — there is no separate database to
// manage.

import { prisma } from '../../config/prisma.js';

export function connectDB(): Promise<unknown> {
  return Promise.resolve(prisma);
}

export function isConnected(): boolean {
  return true;
}

export { prisma };
