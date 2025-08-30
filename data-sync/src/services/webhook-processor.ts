/**
 * WEBHOOK PROCESSOR - Simple, Clean, Effective
 * 
 * Philosophy: One webhook, one timer, one update
 * No queues, no Redis, no complex states
 * Just JavaScript doing what it does best
 */

import { logger } from '../utils/logger.js';
import { getBeds24Client } from '../providers/beds24/client.js';
import { processSingleBookingData } from '../providers/beds24/sync.js';
import { prisma } from '../infra/db/prisma.client.js';

interface PendingWebhook {
  timeoutId: NodeJS.Timeout;
  latestPayload: any;
  receivedAt: Date;
  debounceCount: number;
}

class WebhookProcessor {
  private pendingWebhooks = new Map<string, PendingWebhook>();
  private readonly DEBOUNCE_TIME = parseInt(process.env.WEBHOOK_DEBOUNCE_MS || '60000'); // 1 minute default
  private processedCount = 0;
  private debouncedCount = 0;

  /**
   * Handle incoming webhook with automatic debounce
   */
  async handleWebhook(bookingId: string, payload: any): Promise<void> {
    const existing = this.pendingWebhooks.get(bookingId);

    // Cancel existing timer if present (this is the debounce magic)
    if (existing) {
      clearTimeout(existing.timeoutId);
      this.debouncedCount++;
      
      logger.info({
        event: 'WEBHOOK_DEBOUNCED',
        bookingId,
        previousDebounceCount: existing.debounceCount,
        timeSinceLast: Date.now() - existing.receivedAt.getTime(),
        timestamp: new Date().toISOString()
      });
    }

    // Schedule processing after debounce time
    const timeoutId = setTimeout(
      () => this.processBooking(bookingId),
      this.DEBOUNCE_TIME
    );

    // Store/update pending webhook
    this.pendingWebhooks.set(bookingId, {
      timeoutId,
      latestPayload: payload,
      receivedAt: new Date(),
      debounceCount: existing ? existing.debounceCount + 1 : 0
    });

    logger.info({
      event: 'WEBHOOK_SCHEDULED',
      bookingId,
      scheduledFor: new Date(Date.now() + this.DEBOUNCE_TIME).toISOString(),
      debounceCount: existing ? existing.debounceCount + 1 : 0,
      pendingCount: this.pendingWebhooks.size,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Process booking after debounce period
   */
  private async processBooking(bookingId: string): Promise<void> {
    const pending = this.pendingWebhooks.get(bookingId);
    if (!pending) return; // Shouldn't happen but be safe

    // Remove from pending
    this.pendingWebhooks.delete(bookingId);
    this.processedCount++;

    const startTime = Date.now();
    
    logger.info({
      event: 'PROCESSING_START',
      bookingId,
      debounceCount: pending.debounceCount,
      waitTime: startTime - pending.receivedAt.getTime(),
      timestamp: new Date().toISOString()
    });

    // Try up to 3 times with exponential backoff
    const maxRetries = 3;
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
      // Try to fetch from Beds24 API first
      const client = getBeds24Client();
      let bookingData = await client.getBooking(bookingId);
      
      // Fallback to webhook payload if not found (new bookings)
      if (!bookingData && pending.latestPayload) {
        bookingData = pending.latestPayload.booking || pending.latestPayload;
        logger.info({
          event: 'USING_WEBHOOK_PAYLOAD',
          bookingId,
          reason: 'Not found in Beds24 API',
          timestamp: new Date().toISOString()
        });
      }

      if (!bookingData) {
        // Check if exists in DB and mark as cancelled
        const existing = await prisma.booking.findUnique({
          where: { bookingId }
        });
        
        if (existing) {
          await prisma.booking.update({
            where: { bookingId },
            data: {
              status: 'cancelled',
              BDStatus: 'not-found-in-beds24',
              modifiedDate: new Date().toISOString(),
              lastUpdatedBD: new Date()
            }
          });
          
          logger.info({
            event: 'BOOKING_MARKED_CANCELLED',
            bookingId,
            timestamp: new Date().toISOString()
          });
        } else {
          logger.warn({
            event: 'BOOKING_NOT_FOUND',
            bookingId,
            timestamp: new Date().toISOString()
          });
        }
        return;
      }

      // Process and save to database
      const result = await processSingleBookingData(bookingData);
      
      const processingTime = Date.now() - startTime;
      
      logger.info({
        event: 'PROCESSING_COMPLETE',
        bookingId,
        action: result.action,
        success: result.success,
        processingTimeMs: processingTime,
        debounceSaved: pending.debounceCount,
        attempt: attempt,
        timestamp: new Date().toISOString()
      });
      
      // Success! Exit the retry loop
      return;

    } catch (error: any) {
      lastError = error;
      
      if (attempt < maxRetries) {
        // Wait before retry: 1s, 2s, 4s
        const retryDelay = Math.pow(2, attempt - 1) * 1000;
        
        logger.warn({
          event: 'RETRY_SCHEDULED',
          bookingId,
          attempt,
          maxRetries,
          retryDelay,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    }
    
    // All retries failed
    logger.error({
      event: 'PROCESSING_FAILED_FINAL',
      bookingId,
      attempts: maxRetries,
      error: lastError?.message,
      stack: lastError?.stack,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get current status (for monitoring)
   */
  getStatus() {
    return {
      pending: this.pendingWebhooks.size,
      pendingBookings: Array.from(this.pendingWebhooks.keys()),
      processedTotal: this.processedCount,
      debouncedTotal: this.debouncedCount,
      debounceTimeMs: this.DEBOUNCE_TIME
    };
  }

  /**
   * Clear all pending (for shutdown)
   */
  clearAll(): void {
    for (const [bookingId, pending] of this.pendingWebhooks.entries()) {
      clearTimeout(pending.timeoutId);
      logger.info({
        event: 'WEBHOOK_CANCELLED',
        bookingId,
        reason: 'Shutdown',
        timestamp: new Date().toISOString()
      });
    }
    this.pendingWebhooks.clear();
  }

  /**
   * Process all pending immediately (for graceful shutdown)
   */
  async processAllPending(): Promise<void> {
    const bookingIds = Array.from(this.pendingWebhooks.keys());
    
    logger.info({
      event: 'PROCESSING_ALL_PENDING',
      count: bookingIds.length,
      timestamp: new Date().toISOString()
    });

    // Clear all timers first
    for (const pending of this.pendingWebhooks.values()) {
      clearTimeout(pending.timeoutId);
    }

    // Process all in parallel
    await Promise.allSettled(
      bookingIds.map(bookingId => this.processBooking(bookingId))
    );
  }
}

// Singleton instance
export const webhookProcessor = new WebhookProcessor();