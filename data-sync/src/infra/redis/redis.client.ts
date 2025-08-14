import { Redis } from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: true,
  keepAlive: 30000,
  family: 4, // Force IPv4
  commandTimeout: 5000,
  connectTimeout: 10000,
});

redis.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info('Connected to Redis successfully');
});

redis.on('ready', () => {
  logger.info('Redis client ready for operations');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Attempting to reconnect to Redis...');
});

export async function connectRedis(): Promise<void> {
  try {
    const result = await redis.ping();
    if (result === 'PONG') {
      logger.info('Redis health check passed');
    } else {
      throw new Error(`Unexpected ping response: ${result}`);
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to connect to Redis');
    throw error;
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info('Redis connection closed gracefully');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error closing Redis connection');
  }
}