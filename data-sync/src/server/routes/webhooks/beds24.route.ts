import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger.js';
import { addWebhookJob } from '../../../infra/queues/queue.manager.js';
import { metricsHelpers } from '../../../infra/metrics/prometheus.js';

// TODO: Implement HMAC verification
function verifyHmac(req: Request, res: Response, next: Function) {
  // Placeholder - implement real HMAC verification in production
  next();
}

export function registerBeds24Webhook(router: Router): void {
  router.post('/webhooks/beds24', verifyHmac, async (req: Request, res: Response): Promise<void> => {
    try {
      const { booking, timeStamp } = req.body;
      
      // Validar estructura del webhook de Beds24
      if (!booking || !booking.id) {
        res.status(400).json({ 
          error: 'Missing required fields: booking.id',
          received: false
        });
        return;
      }

      // Extraer datos del formato de Beds24
      const bookingId = String(booking.id);
      const status = booking.status || 'unknown';
      // Determinar acción basada en el estado y timestamps
      const action = booking.modifiedTime && booking.bookingTime !== booking.modifiedTime 
        ? 'modified' 
        : 'created';

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
        status,
        propertyId: booking.propertyId,
        arrival: booking.arrival,
        departure: booking.departure
      }, 'Beds24 webhook received');

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