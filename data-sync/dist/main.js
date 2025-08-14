import express from 'express';
import { connectPrisma } from './infra/db/prisma.client';
import { connectRedis } from './infra/redis/redis.client';
import { registerHealthRoute } from './server/routes/health.route';
import { registerBeds24Webhook } from './server/routes/webhooks/beds24.route';
import { registerQueuesRoute } from './server/routes/admin/queues.route';
import { env } from './config/env';
import { logger } from './utils/logger';
async function main() {
    const app = express();
    app.use(express.json());
    await connectPrisma();
    await connectRedis();
    const router = express.Router();
    registerHealthRoute(router);
    registerBeds24Webhook(router);
    registerQueuesRoute(router);
    app.use('/api', router);
    app.get('/', (req, res) => {
        res.json({
            service: 'data-sync',
            version: '1.0.0',
            endpoints: {
                health: '/api/health',
                webhook: '/api/webhooks/beds24',
                dashboard: '/api/admin/queues/ui',
                stats: '/api/admin/queues/stats',
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
