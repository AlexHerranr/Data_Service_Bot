import { logger } from '../../utils/logger.js';
import { redis } from '../../infra/redis/redis.client.js';
import { prisma } from '../../infra/db/prisma.client.js';
import { getQueueStats } from '../../infra/queues/queue.manager.js';
import { metricsHelpers } from '../../infra/metrics/prometheus.js';
export function registerHealthRoute(router) {
    router.get('/health', async (req, res) => {
        const startTime = Date.now();
        try {
            logger.debug('Health check requested');
            let redisStatus = 'unknown';
            try {
                const pingResult = await redis.ping();
                redisStatus = pingResult === 'PONG' ? 'connected' : 'error';
            }
            catch (error) {
                redisStatus = 'disconnected';
            }
            let databaseStatus = 'unknown';
            try {
                await prisma.$queryRaw `SELECT 1`;
                databaseStatus = 'connected';
            }
            catch (error) {
                databaseStatus = 'disconnected';
            }
            let queueStats = null;
            try {
                queueStats = await getQueueStats();
            }
            catch (error) {
            }
            const isHealthy = redisStatus === 'connected' && databaseStatus === 'connected';
            const responseTime = Date.now() - startTime;
            metricsHelpers.updateConnectionStatus(redisStatus === 'connected', databaseStatus === 'connected');
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
            res.status(isHealthy ? 200 : 503).json(response);
        }
        catch (error) {
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
