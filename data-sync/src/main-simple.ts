/**
 * SIMPLIFIED MAIN - Using the new webhook processor
 * 
 * This is a cleaner version focused on the webhook processing
 * You can gradually migrate from main.ts to this
 */

import express from 'express';
import { connectPrisma } from './infra/db/prisma.client.js';
import { connectRedis } from './infra/redis/redis.client.js';
import { registerHealthRoute } from './server/routes/health.route.js';
import { registerBeds24WebhookV2 } from './server/routes/webhooks/beds24-v2.route.js';
import { webhookProcessor } from './services/webhook-processor.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';

async function main() {
  const app = express();
  
  // Middleware
  app.use(express.json());
  
  // Connect to databases
  await connectPrisma();
  logger.info('✅ Connected to PostgreSQL');
  
  // Redis is optional now (only if you use it for other things)
  if (env.REDIS_URL) {
    await connectRedis();
    logger.info('✅ Connected to Redis (optional)');
  }
  
  // Initialize Beds24 client
  const { beds24Client } = await import('./integrations/beds24.client.js');
  await beds24Client.init();
  logger.info('✅ Beds24 client initialized');
  
  // Routes
  const router = express.Router();
  
  // Health check
  registerHealthRoute(router);
  
  // Webhook endpoint (V2 - simple version)
  registerBeds24WebhookV2(router);
  
  // Mount routes
  app.use('/api/v1', router);
  
  // Status endpoint for the processor
  app.get('/status', (req, res) => {
    res.json({
      service: 'data-sync-simple',
      version: '2.0.0',
      webhook: webhookProcessor.getStatus(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  });
  
  // Start server
  const port = env.PORT || 8080;
  const server = app.listen(port, () => {
    logger.info({
      event: 'SERVER_STARTED',
      port,
      environment: env.NODE_ENV,
      webhookDebounceMs: parseInt(process.env.WEBHOOK_DEBOUNCE_MS || '60000'),
      timestamp: new Date().toISOString()
    });
  });
  
  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({
      event: 'SHUTDOWN_INITIATED',
      signal,
      pendingWebhooks: webhookProcessor.getStatus().pending,
      timestamp: new Date().toISOString()
    });
    
    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });
    
    // Process pending webhooks (optional - you can also just clear them)
    const processPending = process.env.PROCESS_PENDING_ON_SHUTDOWN === 'true';
    
    if (processPending) {
      logger.info('Processing pending webhooks before shutdown...');
      await webhookProcessor.processAllPending();
    } else {
      logger.info('Clearing pending webhooks...');
      webhookProcessor.clearAll();
    }
    
    // Close database connections
    await prisma.$disconnect();
    logger.info('Database disconnected');
    
    logger.info({
      event: 'SHUTDOWN_COMPLETE',
      timestamp: new Date().toISOString()
    });
    
    process.exit(0);
  };
  
  // Handle shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error({
      event: 'UNCAUGHT_EXCEPTION',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    shutdown('UNCAUGHT_EXCEPTION');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({
      event: 'UNHANDLED_REJECTION',
      reason,
      promise,
      timestamp: new Date().toISOString()
    });
  });
}

// Start the application
main().catch((error) => {
  logger.error({
    event: 'STARTUP_FAILED',
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});