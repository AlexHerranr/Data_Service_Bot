#!/usr/bin/env tsx

/**
 * Script de Sincronización: Un mes atrás hasta un año adelante
 * Con manejo automático de rate limits de Beds24
 */

import { getBeds24Client } from '../src/providers/beds24/client.js';
import { syncSingleBooking } from '../src/providers/beds24/sync.js';
import { logger } from '../src/utils/logger.js';
import { connectPrisma } from '../src/infra/db/prisma.client.js';
import { prisma } from '../src/infra/db/prisma.client.js';

interface SyncStats {
  total: number;
  processed: number;
  updated: number;
  created: number;
  skipped: number;
  errors: number;
  rateLimitHits: number;
  startTime: Date;
}

const stats: SyncStats = {
  total: 0,
  processed: 0,
  updated: 0,
  created: 0,
  skipped: 0,
  errors: 0,
  rateLimitHits: 0,
  startTime: new Date()
};

// Calculate date range: 1 month back to 1 year forward
const today = new Date();
const fromDate = new Date(today);
fromDate.setMonth(fromDate.getMonth() - 1); // 1 month back

const toDate = new Date(today);
toDate.setFullYear(toDate.getFullYear() + 1); // 1 year forward

/**
 * Delay helper
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Handle rate limit with 6 minute wait
 */
async function handleRateLimit(): Promise<void> {
  stats.rateLimitHits++;
  const waitTime = 6 * 60 * 1000; // 6 minutes in milliseconds
  
  logger.warn({
    event: 'RATE_LIMIT_HIT',
    waitMinutes: 6,
    rateLimitHits: stats.rateLimitHits,
    willResumeAt: new Date(Date.now() + waitTime).toISOString()
  }, '⚠️ Rate limit hit! Waiting 6 minutes...');
  
  // Show countdown every minute
  for (let i = 6; i > 0; i--) {
    console.log(`⏳ Waiting ${i} more minute${i > 1 ? 's' : ''}...`);
    if (i > 1) await delay(60000); // Wait 1 minute
  }
  
  logger.info('✅ Resuming after rate limit wait');
}

/**
 * Fetch bookings with rate limit handling
 */
async function fetchBookingsWithRetry(
  client: any,
  params: URLSearchParams,
  retries = 3
): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await client.makeRequest({
        method: 'GET',
        url: `/bookings?${params.toString()}`,
      });
      
      return response;
      
    } catch (error: any) {
      const isRateLimit = 
        error.response?.status === 429 || 
        error.message?.includes('rate limit') ||
        error.message?.includes('Too many requests');
      
      if (isRateLimit) {
        await handleRateLimit();
        // Retry after waiting
        continue;
      }
      
      // For other errors, retry with exponential backoff
      if (attempt < retries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        logger.warn({
          attempt,
          waitSeconds: waitTime / 1000,
          error: error.message
        }, 'Request failed, retrying...');
        await delay(waitTime);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Fetch all bookings in date range
 */
async function fetchAllBookings(): Promise<any[]> {
  const client = getBeds24Client();
  let allBookings: any[] = [];
  let offset = 0;
  const batchSize = 100;
  let hasMore = true;
  
  logger.info({
    fromDate: fromDate.toISOString().split('T')[0],
    toDate: toDate.toISOString().split('T')[0],
    batchSize
  }, '📅 Fetching bookings from 1 month ago to 1 year ahead');
  
  while (hasMore) {
    try {
      // Build request parameters
      const params = new URLSearchParams({
        // Arrival dates in range
        arrivalFrom: fromDate.toISOString(),
        arrivalTo: toDate.toISOString(),
        // Include modified bookings too
        modifiedFrom: fromDate.toISOString(),
        // Pagination
        offset: offset.toString(),
        limit: batchSize.toString(),
        // Include all data
        includeInvoiceItems: 'true',
        includeInfoItems: 'true',
        includeMessages: 'true'
      });
      
      const response = await fetchBookingsWithRetry(client, params);
      const bookings = response.data.data || [];
      
      if (bookings.length === 0) {
        hasMore = false;
        logger.info({ 
          totalFetched: allBookings.length 
        }, '✅ All bookings fetched');
      } else {
        allBookings.push(...bookings);
        offset += bookings.length;
        
        logger.info({
          batchSize: bookings.length,
          totalFetched: allBookings.length,
          progress: `${offset} bookings fetched`
        }, `📦 Batch ${Math.ceil(offset / batchSize)} fetched`);
        
        // Small delay between successful requests
        await delay(1000);
      }
      
    } catch (error: any) {
      logger.error({
        error: error.message,
        offset
      }, '❌ Failed to fetch batch after retries');
      break;
    }
  }
  
  return allBookings;
}

/**
 * Process a single booking
 */
async function processBooking(booking: any): Promise<void> {
  const bookingId = booking.id?.toString();
  
  if (!bookingId) {
    stats.errors++;
    return;
  }
  
  try {
    const result = await syncSingleBooking(bookingId);
    
    stats.processed++;
    
    switch (result.action) {
      case 'created':
        stats.created++;
        logger.info({ bookingId }, '✅ Created');
        break;
      case 'updated':
        stats.updated++;
        logger.debug({ bookingId }, '📝 Updated');
        break;
      case 'skipped':
        stats.skipped++;
        logger.debug({ bookingId }, '⏭️ Skipped');
        break;
    }
    
  } catch (error: any) {
    stats.errors++;
    logger.error({
      bookingId,
      error: error.message
    }, '❌ Failed to process booking');
  }
}

/**
 * Show progress
 */
function showProgress(): void {
  const elapsed = (Date.now() - stats.startTime.getTime()) / 1000;
  const rate = stats.processed / elapsed;
  
  console.log(`
📊 Progress Update:
  ├─ Processed: ${stats.processed}/${stats.total} (${Math.round(stats.processed / stats.total * 100)}%)
  ├─ Created: ${stats.created}
  ├─ Updated: ${stats.updated}
  ├─ Skipped: ${stats.skipped}
  ├─ Errors: ${stats.errors}
  ├─ Rate: ${rate.toFixed(1)} bookings/sec
  ├─ Rate Limits Hit: ${stats.rateLimitHits}
  └─ Time: ${Math.round(elapsed / 60)} minutes
  `);
}

/**
 * Main execution
 */
async function main() {
  try {
    // Connect to database
    await connectPrisma();
    logger.info('✅ Connected to database');
    
    // Step 1: Fetch all bookings
    console.log('\n🔄 STEP 1: Fetching bookings from Beds24...\n');
    const allBookings = await fetchAllBookings();
    
    stats.total = allBookings.length;
    
    if (stats.total === 0) {
      logger.warn('No bookings found in date range');
      return;
    }
    
    logger.info({
      total: stats.total,
      dateRange: {
        from: fromDate.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0]
      }
    }, `📚 Found ${stats.total} bookings to process`);
    
    // Step 2: Process bookings in batches
    console.log('\n🔄 STEP 2: Processing bookings...\n');
    
    const processingBatchSize = 10;
    
    for (let i = 0; i < allBookings.length; i += processingBatchSize) {
      const batch = allBookings.slice(i, i + processingBatchSize);
      
      // Process batch in parallel
      await Promise.all(batch.map(booking => processBooking(booking)));
      
      // Show progress every 50 bookings
      if (stats.processed % 50 === 0 || stats.processed === stats.total) {
        showProgress();
      }
      
      // Small delay between batches
      await delay(500);
    }
    
    // Final statistics
    const totalElapsed = (Date.now() - stats.startTime.getTime()) / 1000;
    
    console.log(`
✅ SYNC COMPLETED!
═══════════════════════════════════════
📅 Date Range: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}
📊 Final Statistics:
  ├─ Total Bookings: ${stats.total}
  ├─ Successfully Processed: ${stats.processed}
  ├─ Created: ${stats.created}
  ├─ Updated: ${stats.updated}
  ├─ Skipped: ${stats.skipped}
  ├─ Errors: ${stats.errors}
  ├─ Rate Limit Hits: ${stats.rateLimitHits}
  ├─ Success Rate: ${((stats.processed - stats.errors) / stats.total * 100).toFixed(1)}%
  └─ Total Time: ${Math.round(totalElapsed / 60)} minutes (${(totalElapsed / 3600).toFixed(1)} hours)
═══════════════════════════════════════
    `);
    
  } catch (error: any) {
    logger.error({
      error: error.message,
      stack: error.stack
    }, '❌ Sync failed');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`
╔═══════════════════════════════════════╗
║  BEDS24 SYNC: 1 MONTH BACK → 1 YEAR   ║
║             FORWARD                    ║
╚═══════════════════════════════════════╝

Starting sync from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}
  `);
  
  main().catch((error) => {
    console.error('❌ Unhandled error:', error.message);
    process.exit(1);
  });
}

export { main };