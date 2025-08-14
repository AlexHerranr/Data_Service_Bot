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
import { register } from './infra/metrics/prometheus.js';
import { swaggerSpec } from './docs/openapi.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
async function main() {
    const app = express();
    app.use(express.json());
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
    await connectPrisma();
    await connectRedis();
    const router = express.Router();
    registerHealthRoute(router);
    registerBeds24Webhook(router);
    registerWhapiWebhook(router);
    registerQueuesRoute(router);
    registerTablesRoute(router);
    app.use('/api', router);
    if (env.PROMETHEUS_ENABLED) {
        app.get('/metrics', async (req, res) => {
            try {
                res.set('Content-Type', register.contentType);
                res.end(await register.metrics());
            }
            catch (error) {
                res.status(500).end(error);
            }
        });
    }
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
        app.get('/api-docs.json', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.send(swaggerSpec);
        });
    }
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
                dashboard: '/api/admin/queues/ui',
                stats: '/api/admin/queues/stats',
                metrics: env.PROMETHEUS_ENABLED ? '/metrics' : null,
                docs: env.SWAGGER_ENABLED ? '/api-docs' : null,
            }
        });
    });
    app.listen(env.PORT, () => {
        logger.info(`[data-sync] listening on :${env.PORT}`);
    });
}
main().catch((error) => {
    logger.error({ error: error.message }, 'Failed to start data-sync');
    process.exit(1);
});
