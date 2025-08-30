/**
 * Daily synchronization job
 * Runs every day at 1:00 AM to sync bookings from 1 month ago to 1 year ahead
 */

import cron from 'node-cron';
import { getBeds24Client } from '../providers/beds24/client.js';
import { processSingleBookingData } from '../providers/beds24/sync.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../infra/db/prisma.client.js';

/**
 * Perform daily sync of bookings
 */
async function performDailySync(): Promise<void> {
  const startTime = Date.now();
  const stats = {
    total: 0,
    processed: 0,
    created: 0,
    updated: 0,
    errors: 0
  };

  try {
    logger.info({
      event: 'DAILY_SYNC_START',
      timestamp: new Date().toISOString()
    });

    // Calculate date range
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setMonth(fromDate.getMonth() - 1);
    const toDate = new Date(today);
    toDate.setFullYear(toDate.getFullYear() + 1);

    const client = getBeds24Client();

    // Fetch bookings
    const bookings = await client.getBookings({
      arrivalFrom: fromDate.toISOString().split('T')[0],
      arrivalTo: toDate.toISOString().split('T')[0],
      modifiedFrom: fromDate.toISOString().split('T')[0],
      limit: 1000 // Get up to 1000 bookings
    });

    stats.total = bookings.length;

    // Process each booking
    for (const booking of bookings) {
      try {
        const result = await processSingleBookingData(booking);
        stats.processed++;
        
        if (result.action === 'created') stats.created++;
        else if (result.action === 'updated') stats.updated++;
        
      } catch (error: any) {
        stats.errors++;
        logger.error({
          event: 'DAILY_SYNC_BOOKING_ERROR',
          bookingId: booking.id,
          error: error.message
        });
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);

    logger.info({
      event: 'DAILY_SYNC_COMPLETE',
      stats,
      durationSeconds: duration,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error({
      event: 'DAILY_SYNC_FAILED',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Initialize the cron job
 */
export function initializeDailySyncCron(): void {
  // Schedule for 1:00 AM every day
  const schedule = '0 1 * * *';
  
  logger.info({
    event: 'CRON_JOB_INITIALIZED',
    schedule,
    description: 'Daily sync at 1:00 AM',
    nextRun: getNextRunTime(schedule)
  });

  cron.schedule(schedule, async () => {
    logger.info({ event: 'CRON_JOB_TRIGGERED' });
    await performDailySync();
  }, {
    scheduled: true,
    timezone: "America/Bogota" // Colombia timezone
  });
}

/**
 * Get next run time for logging
 */
function getNextRunTime(schedule: string): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(1, 0, 0, 0);
  return tomorrow.toISOString();
}

// Export for manual triggering
export { performDailySync };