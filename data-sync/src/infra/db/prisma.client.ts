import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger.js';

export const prisma = new PrismaClient();

export async function connectPrisma(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Connected to PostgreSQL (data-sync)');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to connect to PostgreSQL');
    throw error;
  }
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Disconnected from PostgreSQL');
}