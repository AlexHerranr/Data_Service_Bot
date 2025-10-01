import { logger } from '../../../utils/logger.js';
import { addWebhookJob } from '../../../infra/queues/queue.manager.js';
import { metricsHelpers } from '../../../infra/metrics/prometheus.js';
import { env } from '../../../config/env.js';
function verifyBeds24Token(req, res, next) {
    const token = req.headers['x-beds24-token'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!env.BEDS24_WEBHOOK_TOKEN) {
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
export function registerBeds24Webhook(router) {
    router.post('/webhooks/beds24', verifyBeds24Token, async (req, res) => {
        try {
            const payload = req.body;
            res.status(202).json({
                received: true,
                timestamp: new Date().toISOString()
            });
            const bookingId = payload.id || payload.booking?.id || payload.bookingId;
            const action = 'MODIFY';
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
            metricsHelpers.recordWebhook('beds24', action.toLowerCase());
            const jobDelay = 60000;
            logger.info({
                event: 'WEBHOOK_RECEIVED',
                bookingId: bookingId,
                action: action,
                delayMs: jobDelay,
                scheduledFor: new Date(Date.now() + jobDelay).toISOString(),
                messageCount: payload.messages?.length || 0,
                propertyId: payload.propertyId || payload.booking?.propertyId,
                timestamp: new Date().toISOString()
            }, `Webhook received for booking ${bookingId}, scheduled for processing`);
            const jobOptions = { delay: jobDelay };
            const job = await addWebhookJob({
                bookingId: bookingId,
                action: action,
                payload: {
                    id: bookingId,
                    action: action,
                    fullPayload: payload
                },
                delayReason: '1-minute-standard-delay',
                scheduledFor: jobDelay > 0 ? new Date(Date.now() + jobDelay).toISOString() : null
            }, jobOptions);
            logger.info({
                jobId: job.id,
                bookingId,
                action,
                delay: jobDelay,
                delayReason: '1-minute-standard-delay',
                scheduledFor: jobDelay > 0 ? new Date(Date.now() + jobDelay).toISOString() : 'immediate'
            }, 'Beds24 webhook job queued');
        }
        catch (error) {
            logger.error({
                error: error.message,
                body: req.body
            }, 'Beds24 webhook error');
        }
    });
}
