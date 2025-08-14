#!/usr/bin/env tsx

import { config } from 'dotenv';
import { connectPrisma, prisma } from '../src/infra/db/prisma.client';
import { connectRedis } from '../src/infra/redis/redis.client';
import { addBulkSyncJob, getQueueStats } from '../src/infra/queues/queue.manager';
import { logger } from '../src/utils/logger';

config({ path: '.env', override: true });

interface BackfillOptions {
  type: 'cancelled' | 'leads' | 'all';
  from?: string;
  to?: string;
  limit?: number;
  dryRun?: boolean;
  batchSize?: number;
  useQueue?: boolean;
}

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = { 
    type: 'all',
    batchSize: 50,
    useQueue: true
  };

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--type':
        if (['cancelled', 'leads', 'all'].includes(value)) {
          options.type = value as any;
        }
        break;
      case '--from':
        options.from = value;
        break;
      case '--to':
        options.to = value;
        break;
      case '--limit':
        options.limit = parseInt(value) || undefined;
        break;
      case '--batch-size':
        options.batchSize = parseInt(value) || 50;
        break;
      case '--dry-run':
        options.dryRun = true;
        i--; // No value for this flag
        break;
      case '--sync-now':
        options.useQueue = false;
        i--; // No value for this flag
        break;
      case '--help':
        showHelp();
        process.exit(0);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
✅ Data-Sync Backfill Tool

Migrates real Beds24 sync logic to data-sync module.

Usage:
  npm run backfill -- --type <cancelled|leads> [options]

Options:
  --type         Type of sync: 'cancelled' or 'leads'
  --from         Start date (YYYY-MM-DD) - default: varies by type
  --to           End date (YYYY-MM-DD) - default: varies by type
  --limit        Max records to process (default: no limit)
  --batch-size   Jobs batch size for queue processing (default: 50)
  --sync-now     Skip queue and run sync immediately (default: use queue)
  --dry-run      Show what would be done without executing
  --help         Show this help

Examples:
  npm run backfill -- --type cancelled --from 2023-01-01 --to 2025-12-31
  npm run backfill -- --type leads --from 2025-01-14 --to 2025-07-14 --limit 10
  npm run backfill -- --type all --batch-size 100 --sync-now

Environment Required:
  BEDS24_API_URL, BEDS24_TOKEN
  `);
}

async function main() {
  const options = parseArgs();
  
  logger.info({ options }, 'Starting backfill process');

  try {
    // Connect to services
    await connectPrisma();
    await prisma.$connect();
    
    if (options.useQueue) {
      await connectRedis();
      console.log('📡 Using queue-based processing');
    } else {
      console.log('⚡ Using direct sync processing');
      // Import sync functions only when needed
      const { syncCancelledReservations, syncLeadsAndConfirmed } = await import('../src/providers/beds24/sync');
    }
    
    if (options.dryRun) {
      console.log('🧪 DRY RUN - No actual processing will occur');
      console.log('Options:', JSON.stringify(options, null, 2));
      return;
    }

    let results: any = {};

    if (options.type === 'cancelled' || options.type === 'all') {
      console.log('🔍 Processing cancelled reservations...');
      
      if (options.useQueue) {
        const job = await addBulkSyncJob({
          type: 'cancelled',
          dateFrom: options.from || '2023-01-01',
          dateTo: options.to || new Date().toISOString().split('T')[0],
          batchSize: options.batchSize || 50,
          priority: 'normal',
        });
        
        console.log(`✅ Cancelled sync job queued (ID: ${job.id})`);
        results.cancelled = { jobId: job.id, status: 'queued' };
      } else {
        const { syncCancelledReservations } = await import('../src/providers/beds24/sync');
        results.cancelled = await syncCancelledReservations(options.from, options.to);
      }
    }

    if (options.type === 'leads' || options.type === 'all') {
      console.log('🔍 Processing leads and confirmed reservations...');
      
      if (options.useQueue) {
        const job = await addBulkSyncJob({
          type: 'leads',
          dateFrom: options.from || '2025-01-14',
          dateTo: options.to || '2025-07-14',
          batchSize: options.batchSize || 50,
          priority: 'normal',
        });
        
        console.log(`✅ Leads sync job queued (ID: ${job.id})`);
        results.leads = { jobId: job.id, status: 'queued' };
      } else {
        const { syncLeadsAndConfirmed } = await import('../src/providers/beds24/sync');
        results.leads = await syncLeadsAndConfirmed(options.from, options.to);
      }
    }

    if (options.useQueue) {
      console.log('\n✅ Jobs queued successfully');
      console.log('📊 Queue Status:');
      const stats = await getQueueStats();
      console.log(`  - Waiting: ${stats.waiting}`);
      console.log(`  - Active: ${stats.active}`);
      console.log(`  - Total: ${stats.total}`);
      console.log('\n🔗 Monitor progress:');
      console.log('  - Dashboard: http://localhost:3020/admin/queues/ui');
      console.log('  - Stats: curl http://localhost:3020/admin/queues/stats');
    } else {
      console.log('\n✅ Sync Completed');
      console.log('📊 Results:');
      if (results.cancelled && typeof results.cancelled === 'object' && 'processed' in results.cancelled) {
        console.log(`  - Cancelled processed: ${results.cancelled.processed}`);
        console.log(`  - Cancelled upserted: ${results.cancelled.upserted}`);
      }
      if (results.leads && typeof results.leads === 'object' && 'confirmed' in results.leads) {
        console.log(`  - Confirmed: ${results.leads.confirmed}`);
        console.log(`  - Leads: ${results.leads.leads}`);
        console.log(`  - Skipped: ${results.leads.skipped}`);
      }
    }

  } catch (error: any) {
    logger.error({ error: error.message }, 'Backfill failed');
    console.error('\n❌ Backfill failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();