/**
 * Data Sync Service - SIMPLE VERSION
 * 
 * Clean, maintainable, and focused on what matters:
 * Processing Beds24 webhooks with proper debounce
 */

import express from 'express';
import { connectPrisma, prisma } from './infra/db/prisma.client.js';
import { connectRedis } from './infra/redis/redis.client.js';
import { registerHealthRoute } from './server/routes/health.route.js';
import { registerBeds24Webhook } from './server/routes/webhooks/beds24.route.js';
import { registerBeds24WebhookV2 } from './server/routes/webhooks/beds24-v2.route.js';
import { registerTablesRoute } from './server/routes/tables.route.js';
import { beds24Routes } from './server/routes/beds24/beds24.routes.js';
import { webhookProcessor } from './services/webhook-processor.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';

async function main() {
  const app = express();
  
  // Middleware
  app.use(express.json({ limit: '10mb' }));
  
  // Connect to PostgreSQL (required)
  await connectPrisma();
  logger.info('✅ Connected to PostgreSQL');
  
  // Connect to Redis (optional - only for caching tokens)
  try {
    await connectRedis();
    logger.info('✅ Connected to Redis (for token caching)');
  } catch (error) {
    logger.warn('⚠️ Redis not connected - will work without caching');
  }
  
  // Initialize Beds24 client
  try {
    const { getBeds24Client } = await import('./providers/beds24/client.js');
    getBeds24Client(); // Initialize singleton instance
    logger.info('✅ Beds24 client initialized');
  } catch (error) {
    logger.warn('⚠️ Beds24 client initialization failed, will retry on first use');
  }
  
  // Routes
  const router = express.Router();
  
  // Core routes
  registerHealthRoute(router);
  registerBeds24Webhook(router);     // Legacy endpoint (redirects to V2)
  registerBeds24WebhookV2(router);   // New simple webhook handler
  registerTablesRoute(router);
  
  // Beds24 API routes (for manual sync, etc)
  router.use('/beds24', beds24Routes);
  
  // Mount all routes under /api/v1
  app.use('/api/v1', router);
  
  // Root status endpoint
  app.get('/', (req, res) => {
    res.json({
      service: 'data-sync',
      version: '2.0.0',
      status: 'healthy',
      endpoints: {
        webhook: '/api/v1/beds24/v2',
        webhookStatus: '/api/v1/beds24/v2/status',
        health: '/api/v1/health',
        tables: '/api/v1/tables'
      }
    });
  });
  
  // Detailed status endpoint
  app.get('/status', (req, res) => {
    const webhookStatus = webhookProcessor.getStatus();
    res.json({
      service: 'data-sync',
      version: '2.0.0',
      uptime: Math.floor(process.uptime()),
      webhook: {
        ...webhookStatus,
        debounceTimeSeconds: webhookStatus.debounceTimeMs / 1000
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      },
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
      endpoints: {
        webhook: `http://localhost:${port}/api/v1/beds24/v2`,
        status: `http://localhost:${port}/status`
      },
      timestamp: new Date().toISOString()
    }, `[data-sync] listening on :${port}`);
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
    
    // Handle pending webhooks
    const processPending = process.env.PROCESS_PENDING_ON_SHUTDOWN === 'true';
    
    if (processPending && webhookProcessor.getStatus().pending > 0) {
      logger.info('Processing pending webhooks before shutdown...');
      await webhookProcessor.processAllPending();
    } else if (webhookProcessor.getStatus().pending > 0) {
      logger.info('Clearing pending webhooks (Beds24 will retry)...');
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
  
  // Handle errors
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