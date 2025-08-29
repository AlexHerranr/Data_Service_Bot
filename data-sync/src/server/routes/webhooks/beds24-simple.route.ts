/**
 * SIMPLIFIED Beds24 Webhook Route
 * 
 * Just receive webhook → schedule processing → done
 */

import { Router } from 'express';
import { logger } from '../../../utils/logger.js';
import { processWebhookSimple } from '../../../services/simple-webhook-processor.js';

export function registerBeds24WebhookSimple(router: Router) {
  router.post('/beds24-simple', async (req, res) => {
    try {
      const payload = req.body;
      
      // Extract booking ID
      const bookingId = payload?.booking?.id || payload?.bookingId;
      
      if (!bookingId) {
        logger.warn({ payload }, 'Webhook missing booking ID');
        return res.status(400).json({ error: 'Missing booking ID' });
      }
      
      // Log reception
      logger.info({ 
        bookingId,
        guestName: payload?.booking?.firstName,
        status: payload?.booking?.status
      }, 'Beds24 webhook received');
      
      // Schedule processing (with automatic debounce)
      await processWebhookSimple(bookingId.toString(), payload.booking || payload);
      
      // Respond immediately
      res.status(200).json({ 
        status: 'scheduled',
        bookingId,
        message: 'Will process in 1 minute'
      });
      
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error handling webhook');
      res.status(500).json({ error: 'Internal error' });
    }
  });
  
  // Status endpoint for monitoring
  router.get('/beds24-simple/status', (req, res) => {
    const { getPendingStatus } = require('../../../services/simple-webhook-processor.js');
    res.json(getPendingStatus());
  });
}