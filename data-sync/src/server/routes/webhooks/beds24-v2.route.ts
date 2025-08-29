/**
 * Beds24 Webhook Route V2 - SIMPLE VERSION
 * 
 * No queues, no Redis, just debounce and process
 */

import { Router } from 'express';
import { logger } from '../../../utils/logger.js';
import { webhookProcessor } from '../../../services/webhook-processor.js';

export function registerBeds24WebhookV2(router: Router) {
  
  /**
   * Main webhook endpoint
   */
  router.post('/beds24/v2', async (req, res) => {
    try {
      const payload = req.body;
      
      // Extract booking ID (handle different payload formats)
      const bookingId = payload?.booking?.id || 
                       payload?.bookingId || 
                       payload?.id;
      
      if (!bookingId) {
        logger.warn({ 
          payload: JSON.stringify(payload).substring(0, 200) 
        }, 'Webhook missing booking ID');
        
        return res.status(400).json({ 
          error: 'Missing booking ID',
          received: Object.keys(payload || {})
        });
      }

      // Log reception (minimal)
      logger.info({
        event: 'WEBHOOK_RECEIVED',
        bookingId: bookingId.toString(),
        guestName: payload?.booking?.firstName,
        status: payload?.booking?.status,
        propertyId: payload?.booking?.propertyId,
        timestamp: new Date().toISOString()
      });

      // Process with debounce
      await webhookProcessor.handleWebhook(
        bookingId.toString(), 
        payload
      );

      // Immediate response (Beds24 expects 200 quickly)
      res.status(200).json({ 
        status: 'accepted',
        bookingId: bookingId.toString(),
        message: 'Scheduled for processing'
      });

    } catch (error: any) {
      logger.error({
        event: 'WEBHOOK_ERROR',
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      // Still return 200 to prevent Beds24 retries
      res.status(200).json({ 
        status: 'error',
        message: 'Internal error, will retry'
      });
    }
  });

  /**
   * Status endpoint for monitoring
   */
  router.get('/beds24/v2/status', (req, res) => {
    const status = webhookProcessor.getStatus();
    res.json({
      ...status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  /**
   * Manual trigger for testing
   */
  router.post('/beds24/v2/test/:bookingId', async (req, res) => {
    const { bookingId } = req.params;
    
    // Create a test webhook payload
    const testPayload = {
      booking: {
        id: bookingId,
        firstName: 'TEST',
        status: 'confirmed',
        ...req.body // Allow override
      }
    };

    await webhookProcessor.handleWebhook(bookingId, testPayload);
    
    res.json({
      status: 'scheduled',
      bookingId,
      message: 'Test webhook scheduled'
    });
  });
}