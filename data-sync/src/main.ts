import express from 'express';
import promBundle from 'express-prom-bundle';
import swaggerUi from 'swagger-ui-express';
import { connectPrisma } from './infra/db/prisma.client.js';
import { connectRedis } from './infra/redis/redis.client.js';
import { registerHealthRoute } from './server/routes/health.route.js';
import { registerBeds24Webhook } from './server/routes/webhooks/beds24.route.js';
import { registerWhapiWebhook } from './server/routes/webhooks/whapi.route.js';
import { registerQueuesRoute } from './server/routes/admin/queues.route.js';
import { register } from './infra/metrics/prometheus.js';
import { swaggerSpec } from './docs/openapi.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

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
  
  // Routes
  const router = express.Router();
  registerHealthRoute(router);
  registerBeds24Webhook(router);
  registerWhapiWebhook(router);
  registerQueuesRoute(router);
  
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
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        webhooks: {
          beds24: '/api/webhooks/beds24',
          whapi: '/api/webhooks/whapi'
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

main().catch((error) => {
  logger.error({ error: error.message }, 'Failed to start data-sync');
  process.exit(1);
});