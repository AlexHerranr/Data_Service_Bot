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
            const hasMessages = payload.messages && Array.isArray(payload.messages) && payload.messages.length > 0;
            const isMessageUpdate = action === 'MODIFY' && hasMessages;
            let jobDelay = 0;
            let delayReason = 'immediate';
            if (action === 'MODIFY') {
                if (isMessageUpdate) {
                    jobDelay = 0;
                    delayReason = 'immediate-message-update';
                    logger.info({
                        bookingId,
                        action,
                        messageCount: payload.messages?.length || 0,
                        lastMessage: payload.messages?.[payload.messages.length - 1]?.message?.substring(0, 50) || 'N/A',
                        lastMessageSource: payload.messages?.[payload.messages.length - 1]?.source || 'unknown'
                    }, '💬 MODIFY with messages - processing immediately');
                }
                else {
                    jobDelay = 180000;
                    delayReason = '3-minute-delay-for-data-modifications';
                    logger.info({
                        bookingId,
                        action,
                        delayMinutes: 3,
                        delayMs: jobDelay,
                        scheduledFor: new Date(Date.now() + jobDelay).toISOString(),
                        modificationType: 'data-update'
                    }, '⏰ MODIFY without messages - scheduled for 3 minutes delay');
                }
            }
            else if (action === 'CREATED') {
                logger.info({
                    bookingId,
                    action
                }, '🚀 CREATED webhook will be processed immediately');
            }
            else if (action === 'CANCEL') {
                logger.info({
                    bookingId,
                    action
                }, '❌ CANCEL webhook will be processed immediately');
            }
            const jobOptions = jobDelay > 0 ? { delay: jobDelay } : {};
            const job = await addWebhookJob({
                bookingId: bookingId,
                action: action,
                payload: {
                    id: bookingId,
                    action: action,
                    fullPayload: payload
                },
                delayReason: delayReason,
                scheduledFor: jobDelay > 0 ? new Date(Date.now() + jobDelay).toISOString() : null
            }, jobOptions);
            logger.info({
                jobId: job.id,
                bookingId,
                action,
                delay: jobDelay,
                delayReason: delayReason,
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
