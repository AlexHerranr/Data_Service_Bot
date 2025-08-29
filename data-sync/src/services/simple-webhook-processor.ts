/**
 * SIMPLE WEBHOOK PROCESSOR
 * 
 * Filosofía: KISS (Keep It Simple, Stupid)
 * - Un webhook llega
 * - Esperamos 1 minuto (con debounce si llegan más)
 * - Actualizamos la BD
 * - Fin
 */

import { logger } from '../utils/logger.js';
import { syncSingleBooking } from '../providers/beds24/sync.js';

// Simple in-memory store for pending updates
const pendingUpdates = new Map<string, NodeJS.Timeout>();

/**
 * Process a Beds24 webhook with debounce
 * If another webhook arrives for the same booking, it resets the timer
 */
export async function processWebhookSimple(bookingId: string, webhookPayload: any) {
  // Cancel any existing timer for this booking (debounce)
  if (pendingUpdates.has(bookingId)) {
    clearTimeout(pendingUpdates.get(bookingId)!);
    logger.info({ bookingId }, 'Debounced: Cancelled previous timer, restarting 1-minute delay');
  }

  // Set new timer for 1 minute
  const timer = setTimeout(async () => {
    try {
      logger.info({ bookingId }, 'Processing booking after 1-minute delay');
      
      // Clean up from pending
      pendingUpdates.delete(bookingId);
      
      // Process the booking
      const result = await syncSingleBooking(bookingId, webhookPayload);
      
      if (result.success) {
        logger.info({ 
          bookingId, 
          action: result.action 
        }, `✅ Booking ${result.action} successfully`);
      } else {
        logger.warn({ 
          bookingId, 
          action: result.action 
        }, `⚠️ Booking processing skipped`);
      }
    } catch (error: any) {
      logger.error({ 
        bookingId, 
        error: error.message 
      }, '❌ Error processing booking');
    }
  }, 60000); // 1 minute

  // Store the timer
  pendingUpdates.set(bookingId, timer);
  
  logger.info({ 
    bookingId,
    pendingCount: pendingUpdates.size 
  }, 'Webhook scheduled for processing in 1 minute');
}

/**
 * Get status of pending updates (for monitoring)
 */
export function getPendingStatus() {
  return {
    count: pendingUpdates.size,
    bookingIds: Array.from(pendingUpdates.keys())
  };
}

/**
 * Clear all pending updates (for shutdown)
 */
export function clearAllPending() {
  for (const timer of pendingUpdates.values()) {
    clearTimeout(timer);
  }
  pendingUpdates.clear();
  logger.info('Cleared all pending webhook timers');
}