import { logger } from '../../../utils/logger';
import { addWebhookJob } from '../../../infra/queues/queue.manager';
function verifyHmac(req, res, next) {
    next();
}
export function registerBeds24Webhook(router) {
    router.post('/webhooks/beds24', verifyHmac, async (req, res) => {
        try {
            const { bookingId, action, status } = req.body;
            if (!bookingId || !action) {
                return res.status(400).json({
                    error: 'Missing required fields: bookingId, action',
                    received: false
                });
            }
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
            }
            else {
                logger.warn({
                    bookingId,
                    action
                }, 'Unknown webhook action, skipping');
            }
        }
        catch (error) {
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
