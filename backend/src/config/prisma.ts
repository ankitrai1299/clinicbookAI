import { PrismaClient } from '@prisma/client';

import { env } from './env.js';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error']
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export const connectDatabase = async () => {
  await prisma.$connect();
};

export const disconnectDatabase = async () => {
  await prisma.$disconnect();
};

export const healthCheckDatabase = async () => {
  await prisma.$queryRaw`SELECT 1`;
};