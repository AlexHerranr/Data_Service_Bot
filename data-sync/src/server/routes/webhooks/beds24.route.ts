/**
 * Beds24 Webhook Route - REDIRECTS TO V2
 * 
 * This file exists for backwards compatibility
 * All webhooks are redirected to the new simple processor
 */

import { Router } from 'express';
import { webhookProcessor } from '../../../services/webhook-processor.js';
import { logger } from '../../../utils/logger.js';

export function registerBeds24Webhook(router: Router) {
  
  // Redirect old endpoint to new processor
  router.post('/beds24', async (req, res) => {
    try {
      const payload = req.body;
      
      // Extract booking ID
      const bookingId = payload?.booking?.id || 
                       payload?.bookingId || 
                       payload?.id;
      
      if (!bookingId) {
        logger.warn({ 
          payload: JSON.stringify(payload).substring(0, 200) 
        }, 'Legacy webhook missing booking ID');
        
        return res.status(400).json({ 
          error: 'Missing booking ID'
        });
      }

      logger.info({
        event: 'LEGACY_WEBHOOK_RECEIVED',
        bookingId: bookingId.toString(),
        note: 'Redirecting to new processor',
        timestamp: new Date().toISOString()
      });

      // Process with new handler
      await webhookProcessor.handleWebhook(
        bookingId.toString(), 
        payload
      );

      res.status(200).json({ 
        status: 'accepted',
        bookingId: bookingId.toString(),
        processor: 'v2'
      });

    } catch (error: any) {
      logger.error({
        event: 'LEGACY_WEBHOOK_ERROR',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      res.status(200).json({ 
        status: 'error'
      });
    }
  });
}