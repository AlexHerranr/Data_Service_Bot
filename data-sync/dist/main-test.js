import express from 'express';
import { connectPrisma } from './infra/db/prisma.client.js';
import { registerHealthRoute } from './server/routes/health.route.js';
import { registerTablesRoute } from './server/routes/tables.route.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
async function main() {
    const app = express();
    app.use(express.json());
    await connectPrisma();
    logger.info('Connected to PostgreSQL - Testing mode (Redis disabled)');
    const router = express.Router();
    registerHealthRoute(router);
    registerTablesRoute(router);
    app.use('/api', router);
    app.get('/', (req, res) => {
        res.json({
            service: 'data-sync-test',
            version: '1.0.0',
            mode: 'testing',
            endpoints: {
                health: '/api/health',
                tables: '/api/tables/:tableName',
            }
        });
    });
    app.listen(env.PORT, () => {
        logger.info(`[data-sync-test] listening on :${env.PORT}`);
    });
}
main().catch((error) => {
    logger.error({ error: error.message }, 'Failed to start data-sync-test');
    process.exit(1);
});
