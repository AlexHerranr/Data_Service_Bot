import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger.js';
import { addWebhookJob } from '../../../infra/queues/queue.manager.js';
import { metricsHelpers } from '../../../infra/metrics/prometheus.js';
import { env } from '../../../config/env.js';

// Simple token verification for Beds24 webhooks
function verifyBeds24Token(req: Request, res: Response, next: Function) {
  const token = req.headers['x-beds24-token'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!env.BEDS24_WEBHOOK_TOKEN) {
    // No token configured - allow all webhooks (no verification)
    return next();
  }
  
  if (token !== env.BEDS24_WEBHOOK_TOKEN) {
    logger.warn({ 
      providedToken: token ? `${String(token).substring(0, 10)}...` : 'none',
      expectedExists: !!env.BEDS24_WEBHOOK_TOKEN 
    }, 'Beds24 webhook invalid token');
    
    return res.status(401).json({ 
      error: 'Invalid token',
      received: false 
    });
  }
  
  next();
}

export function registerBeds24Webhook(router: Router): void {
  router.post('/webhooks/beds24', verifyBeds24Token, async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = req.body;
      
      // Respuesta inmediata 202 para Beds24 (no bloquear retries)
      res.status(202).json({ 
        received: true,
        timestamp: new Date().toISOString()
      });

      // Básico: detectar ID y acción
      const bookingId = payload.id || payload.booking?.id || payload.bookingId;
      
      // Mapear acciones de Beds24 correctamente
      let action = payload.action || 'MODIFY';
      if (action === 'created') action = 'CREATED';
      if (action === 'modified') action = 'MODIFY'; 
      if (action === 'cancelled') action = 'CANCEL';
      
      if (!bookingId) {
        logger.warn({ payload }, 'Beds24 webhook missing booking ID, skipping');
        return;
      }

      logger.info({ 
        type: 'beds24:webhook', 
        bookingId, 
        action,
        payload: payload
      }, 'Beds24 webhook received');

      // Record webhook metrics
      metricsHelpers.recordWebhook('beds24', action.toLowerCase());

      // Encolar job - simple job ID
      const job = await addWebhookJob({
        bookingId: bookingId,
        action: action as any,
        payload: {
          id: bookingId,
          action: action,
          fullPayload: payload
        }
      });

      logger.info({ 
        jobId: job.id,
        bookingId, 
        action
      }, 'Beds24 webhook job queued');
      
    } catch (error: any) {
      logger.error({ 
        error: error.message,
        body: req.body
      }, 'Beds24 webhook error');
      
      // Ya enviamos 202, no cambiar respuesta
    }
  });
}