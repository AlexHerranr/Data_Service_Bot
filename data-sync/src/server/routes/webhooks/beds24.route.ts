import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger';
import { addWebhookJob } from '../../../infra/queues/queue.manager';
import { metricsHelpers } from '../../../infra/metrics/prometheus';

// TODO: Implement HMAC verification
function verifyHmac(req: Request, res: Response, next: Function) {
  // Placeholder - implement real HMAC verification in production
  next();
}

export function registerBeds24Webhook(router: Router): void {
  router.post('/webhooks/beds24', verifyHmac, async (req: Request, res: Response): Promise<void> => {
    try {
      const { bookingId, action, status } = req.body;
      
      // Validar datos del webhook
      if (!bookingId || !action) {
        res.status(400).json({ 
          error: 'Missing required fields: bookingId, action',
          received: false
        });
        return;
      }

      // Respuesta inmediata para Beds24
      res.status(200).json({ 
        status: 'accepted', 
        message: 'Webhook queued for processing',
        timestamp: new Date().toISOString()
      });

      logger.info({ 
        type: 'beds24:webhook', 
        bookingId, 
        action, 
        status 
      }, 'Webhook received');

      // Record webhook metrics
      metricsHelpers.recordWebhook('beds24', action);

      // Encolar job para procesamiento asíncrono
      if (action === 'created' || action === 'modified' || action === 'cancelled') {
        const job = await addWebhookJob({
          bookingId: String(bookingId),
          action,
          timestamp: new Date(),
          priority: 'high',
        });

        logger.info({ 
          jobId: job.id,
          bookingId, 
          action 
        }, 'Webhook job queued successfully');
      } else {
        logger.warn({ 
          bookingId, 
          action 
        }, 'Unknown webhook action, skipping');
      }
      
    } catch (error: any) {
      logger.error({ 
        error: error.message,
        body: req.body
      }, 'Webhook processing error');
      
      res.status(500).json({ 
        error: 'Internal server error',
        received: false
      });
    }
  });
}