import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger.js';
// import { beds24Queue } from '../../../infra/queues/queue.manager.js'; // Removed - no longer using queues
import { metricsHelpers } from '../../../infra/metrics/prometheus.js';

export function registerWhapiWebhook(router: Router): void {
  router.post('/webhooks/whapi', async (req: Request, res: Response): Promise<void> => {
    try {
      const { type, data } = req.body;
      
      // Validar datos del webhook
      if (!type || !data) {
        res.status(400).json({ 
          error: 'Missing required fields: type, data',
          received: false
        });
        return;
      }

      // Respuesta inmediata para Whapi
      res.status(200).json({ 
        status: 'accepted', 
        message: 'Webhook queued for processing',
        timestamp: new Date().toISOString()
      });

      logger.info({ 
        type: 'whapi:webhook', 
        webhookType: type,
        dataKeys: Object.keys(data)
      }, 'Whapi webhook received');

      // Record webhook metrics
      metricsHelpers.recordWebhook('whapi', type);

      // TODO: Process Whapi webhooks when needed
      // For now, just log and acknowledge
      if (type === 'message' || type === 'message_status' || type === 'client_ready') {
        logger.info({ 
          webhookType: type,
          note: 'Whapi processing not implemented in simplified version'
        }, 'Whapi webhook received but not processed');
      } else {
        logger.warn({ 
          type 
        }, 'Unknown Whapi webhook type, skipping');
      }
      
    } catch (error: any) {
      logger.error({ 
        error: error.message,
        body: req.body
      }, 'Whapi webhook processing error');
      
      res.status(500).json({ 
        error: 'Internal server error',
        received: false
      });
    }
  });
}