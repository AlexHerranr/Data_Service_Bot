import { logger } from '../../../utils/logger.js';
import { addWebhookJob } from '../../../infra/queues/queue.manager.js';
import { metricsHelpers } from '../../../infra/metrics/prometheus.js';
function verifyHmac(req, res, next) {
    next();
}
export function registerBeds24Webhook(router) {
    router.post('/webhooks/beds24', verifyHmac, async (req, res) => {
        try {
            const { booking, timeStamp } = req.body;
            if (!booking || !booking.id) {
                res.status(400).json({
                    error: 'Missing required fields: booking.id',
                    received: false
                });
                return;
            }
            const bookingId = String(booking.id);
            const status = booking.status || 'unknown';
            let action = 'created';
            if (booking.cancelTime) {
                action = 'cancelled';
            }
            else if (booking.modifiedTime && booking.bookingTime !== booking.modifiedTime) {
                action = 'modified';
            }
            if (status && (status.toLowerCase().includes('cancel') || status.toLowerCase().includes('deleted'))) {
                action = 'cancelled';
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
                status,
                propertyId: booking.propertyId,
                arrival: booking.arrival,
                departure: booking.departure
            }, 'Beds24 webhook received');
            metricsHelpers.recordWebhook('beds24', action);
            const job = await addWebhookJob({
                bookingId: String(bookingId),
                action,
                timestamp: new Date(),
                priority: action === 'cancelled' ? 'high' : 'normal',
            });
            logger.info({
                jobId: job.id,
                bookingId,
                action,
                status
            }, 'Beds24 webhook job queued successfully');
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
