import { logger } from '../../../utils/logger';
import { beds24Queue } from '../../../infra/queues/queue.manager';
import { metricsHelpers } from '../../../infra/metrics/prometheus';
export function registerWhapiWebhook(router) {
    router.post('/webhooks/whapi', async (req, res) => {
        try {
            const { type, data } = req.body;
            if (!type || !data) {
                res.status(400).json({
                    error: 'Missing required fields: type, data',
                    received: false
                });
                return;
            }
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
            metricsHelpers.recordWebhook('whapi', type);
            if (type === 'message' || type === 'message_status' || type === 'client_ready') {
                const job = await beds24Queue.add('whapi-webhook', {
                    type: 'whapi',
                    source: 'whapi',
                    webhookType: type,
                    data,
                    timestamp: new Date(),
                    priority: 'normal',
                });
                logger.info({
                    jobId: job.id,
                    type
                }, 'Whapi webhook job queued successfully');
            }
            else {
                logger.warn({
                    type
                }, 'Unknown Whapi webhook type, skipping');
            }
        }
        catch (error) {
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
