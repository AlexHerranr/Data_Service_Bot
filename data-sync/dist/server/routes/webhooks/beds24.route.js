import { logger } from '../../../utils/logger.js';
import { addWebhookJob } from '../../../infra/queues/queue.manager.js';
import { metricsHelpers } from '../../../infra/metrics/prometheus.js';
import { env } from '../../../config/env.js';
function verifyBeds24Token(req, res, next) {
    const token = req.headers['x-beds24-token'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!env.BEDS24_WEBHOOK_TOKEN) {
        logger.warn('BEDS24_WEBHOOK_TOKEN not configured, skipping verification');
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
            let action = payload.action || 'MODIFY';
            if (action === 'created')
                action = 'CREATED';
            if (action === 'modified')
                action = 'MODIFY';
            if (action === 'cancelled')
                action = 'CANCEL';
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
            const job = await addWebhookJob({
                bookingId: bookingId,
                action: action,
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
        }
        catch (error) {
            logger.error({
                error: error.message,
                body: req.body
            }, 'Beds24 webhook error');
        }
    });
}
