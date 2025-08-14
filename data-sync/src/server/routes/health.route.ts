import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger.js';
import { redis } from '../../infra/redis/redis.client.js';
import { prisma } from '../../infra/db/prisma.client.js';
import { getQueueStats } from '../../infra/queues/queue.manager.js';
import { metricsHelpers } from '../../infra/metrics/prometheus.js';

export function registerHealthRoute(router: Router): void {
  router.get('/health', async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      logger.debug('Health check requested');
      
      // Check Redis connection
      let redisStatus = 'unknown';
      try {
        const pingResult = await redis.ping();
        redisStatus = pingResult === 'PONG' ? 'connected' : 'error';
      } catch (error) {
        redisStatus = 'disconnected';
      }
      
      // Check Prisma connection
      let databaseStatus = 'unknown';
      try {
        await prisma.$queryRaw`SELECT 1`;
        databaseStatus = 'connected';
      } catch (error) {
        databaseStatus = 'disconnected';
      }
      
      // Check queue health
      let queueStats = null;
      try {
        queueStats = await getQueueStats();
      } catch (error) {
        // Queue stats not critical for basic health
      }
      
      // Determine overall health
      const isHealthy = redisStatus === 'connected' && databaseStatus === 'connected';
      const responseTime = Date.now() - startTime;
      
      // Update connection status metrics
      metricsHelpers.updateConnectionStatus(
        redisStatus === 'connected',
        databaseStatus === 'connected'
      );
      
      // Update system health metrics
      metricsHelpers.updateSystemHealth('overall', isHealthy);
      metricsHelpers.updateSystemHealth('redis', redisStatus === 'connected');
      metricsHelpers.updateSystemHealth('database', databaseStatus === 'connected');
      
      const response = {
        status: isHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        response_time_ms: responseTime,
        services: {
          redis: redisStatus,
          database: databaseStatus,
        },
        ...(queueStats && {
          queues: {
            'beds24-sync': {
              waiting: queueStats.waiting,
              active: queueStats.active,
              failed: queueStats.failed,
              total: queueStats.total,
            }
          }
        }),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      };
      
      // Set appropriate status code
      res.status(isHealthy ? 200 : 503).json(response);
      
    } catch (error: any) {
      logger.error({ error: error.message }, 'Health check failed');
      
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
        response_time_ms: Date.now() - startTime,
      });
    }
  });
}