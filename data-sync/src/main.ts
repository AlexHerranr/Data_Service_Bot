import express from 'express';
import promBundle from 'express-prom-bundle';
import swaggerUi from 'swagger-ui-express';
import { connectPrisma } from './infra/db/prisma.client.js';
import { connectRedis } from './infra/redis/redis.client.js';
import { registerHealthRoute } from './server/routes/health.route.js';
import { registerBeds24Webhook } from './server/routes/webhooks/beds24.route.js';
import { registerWhapiWebhook } from './server/routes/webhooks/whapi.route.js';
import { registerQueuesRoute } from './server/routes/admin/queues.route.js';
import { registerTablesRoute } from './server/routes/tables.route.js';
import { beds24Routes } from './server/routes/beds24/beds24.routes.js';
import { beds24Client } from './integrations/beds24.client.js';
import { register } from './infra/metrics/prometheus.js';
import { swaggerSpec } from './docs/openapi.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { beds24Worker, closeQueues } from './infra/queues/queue.manager.js';

async function main() {
  const app = express();
  
  // Middleware
  app.use(express.json());
  
  // Prometheus metrics middleware
  if (env.PROMETHEUS_ENABLED) {
    app.use(promBundle({
      includePath: true,
      includeStatusCode: true,
      includeMethod: true,
      metricsPath: '/metrics',
      promRegistry: register,
      httpDurationMetricName: `${env.METRICS_PREFIX}http_request_duration_seconds`,
    }));
  }
  
  // Connect to database and Redis
  await connectPrisma();
  await connectRedis();
  
  // Initialize Beds24 client with persistent auth (Redis cache)
  try {
    await beds24Client.initialize();
    logger.info('✅ Beds24 client initialized successfully');
  } catch (error: any) {
    logger.warn({ error: error.message }, '⚠️ Beds24 write operations will not be available - continuing without write auth');
    // Continue startup even if Beds24 init fails (READ operations still work)
  }

  // Clean old jobs before starting worker
  logger.info('🧺 Cleaning old jobs from queue...');
  const { beds24Queue } = await import('./infra/queues/queue.manager.js');
  
  let totalRemoved = 0;
  
  // Remove ALL delayed jobs (they're from previous runs)
  const delayedJobs = await beds24Queue.getDelayed();
  for (const job of delayedJobs) {
    const jobAge = Date.now() - job.timestamp;
    await job.remove();
    totalRemoved++;
    logger.info({ 
      jobId: job.id, 
      age: Math.floor(jobAge / 1000) + 's',
      type: 'delayed'
    }, `Removed delayed job: ${job.id}`);
  }
  
  // Remove waiting jobs older than 2 minutes
  const waitingJobs = await beds24Queue.getWaiting();
  for (const job of waitingJobs) {
    const jobAge = Date.now() - job.timestamp;
    if (jobAge > 2 * 60 * 1000) { // Older than 2 minutes
      await job.remove();
      totalRemoved++;
      logger.info({ 
        jobId: job.id, 
        age: Math.floor(jobAge / 1000) + 's',
        type: 'waiting' 
      }, `Removed old waiting job: ${job.id}`);
    }
  }
  
  // Clean failed jobs older than 10 minutes
  const failedJobs = await beds24Queue.getFailed();
  for (const job of failedJobs) {
    const jobAge = Date.now() - job.timestamp;
    if (jobAge > 10 * 60 * 1000) { // Older than 10 minutes
      await job.remove();
      totalRemoved++;
      logger.info({ 
        jobId: job.id, 
        age: Math.floor(jobAge / 1000) + 's',
        type: 'failed'
      }, `Removed old failed job: ${job.id}`);
    }
  }
  
  if (totalRemoved > 0) {
    logger.warn({ 
      count: totalRemoved,
      delayed: delayedJobs.length,
      waiting: waitingJobs.filter(j => Date.now() - j.timestamp > 2 * 60 * 1000).length,
      failed: failedJobs.filter(j => Date.now() - j.timestamp > 10 * 60 * 1000).length
    }, `🧺 CLEANED ${totalRemoved} old jobs from queue on startup`);
  }
  
  // Initialize BullMQ worker
  logger.info('🔄 Starting BullMQ worker...');
  // Worker is already initialized by importing from queue.manager.js
  logger.info('✅ BullMQ worker started successfully');
  
  // Debug: Check worker status every 30 seconds
  setInterval(async () => {
    const { beds24Queue } = await import('./infra/queues/queue.manager.js');
    const waiting = await beds24Queue.getWaitingCount();
    const active = await beds24Queue.getActiveCount();
    const completed = await beds24Queue.getCompletedCount();
    const failed = await beds24Queue.getFailedCount();
    
    logger.info({
      event: 'QUEUE_STATUS_CHECK',
      waiting,
      active,
      completed,
      failed,
      timestamp: new Date().toISOString()
    }, `Queue status - Waiting: ${waiting}, Active: ${active}, Completed: ${completed}, Failed: ${failed}`);
  }, 30000);
  
  // Routes
  const router = express.Router();
  registerHealthRoute(router);
  registerBeds24Webhook(router);
  registerWhapiWebhook(router);
  registerQueuesRoute(router);
  registerTablesRoute(router);
  
  // Beds24 API routes
  router.use('/beds24', beds24Routes);
  
  app.use('/api', router);
  
  // Metrics endpoint (if not handled by promBundle)
  if (env.PROMETHEUS_ENABLED) {
    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (error) {
        res.status(500).end(error);
      }
    });
  }

  // Swagger API documentation
  if (env.SWAGGER_ENABLED) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Data Sync API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
      },
    }));
    
    // Raw OpenAPI spec endpoint
    app.get('/api-docs.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });
  }

  // Root redirect for convenience
  app.get('/', (req, res) => {
    res.json({
      service: 'data-sync',
      version: '1.0.1',
      endpoints: {
        health: '/api/health',
        webhooks: {
          beds24: '/api/webhooks/beds24',
          whapi: '/api/webhooks/whapi'
        },
        tables: '/api/tables/:tableName',
        beds24: {
          bookings: '/api/beds24/bookings',
          properties: '/api/beds24/properties',
          availability: '/api/beds24/availability'
        },
        dashboard: '/api/admin/queues/ui',
        stats: '/api/admin/queues/stats',
        metrics: env.PROMETHEUS_ENABLED ? '/metrics' : null,
        docs: env.SWAGGER_ENABLED ? '/api-docs' : null,
      }
    });
  });
  
  // Start server
  app.listen(env.PORT, () => {
    logger.info(`[data-sync] listening on :${env.PORT}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await closeQueues();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await closeQueues();
  process.exit(0);
});

main().catch((error) => {
  logger.error({ error: error.message }, 'Failed to start data-sync');
  process.exit(1);
});