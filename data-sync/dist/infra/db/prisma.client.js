import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
export const prisma = new PrismaClient();
export async function connectPrisma() {
    try {
        await prisma.$connect();
        logger.info('Connected to PostgreSQL (data-sync)');
    }
    catch (error) {
        logger.error({ error: error.message }, 'Failed to connect to PostgreSQL');
        throw error;
    }
}
export async function disconnectPrisma() {
    await prisma.$disconnect();
    logger.info('Disconnected from PostgreSQL');
}
