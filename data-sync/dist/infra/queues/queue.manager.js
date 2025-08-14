import { Queue, Worker } from 'bullmq';
import { redis } from '../redis/redis.client.js';
import { logger } from '../../utils/logger.js';
import { syncSingleBooking, syncCancelledReservations, syncLeadsAndConfirmed } from '../../providers/beds24/sync.js';
import { metricsHelpers } from '../metrics/prometheus.js';
const QUEUE_CONFIG = {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
    }
};
export const beds24Queue = new Queue('beds24-sync', QUEUE_CONFIG);
export const deadLetterQueue = new Queue('beds24-dlq', { connection: redis });
export const beds24Worker = new Worker('beds24-sync', async (job) => {
    const { data } = job;
    const startTime = metricsHelpers.recordJobStart(data.type);
    logger.info({
        jobId: job.id,
        type: data.type,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 3
    }, 'Processing job');
    try {
        if (data.type === 'webhook') {
            const webhookData = data;
            await syncSingleBooking(webhookData.bookingId);
            metricsHelpers.recordJobComplete(data.type, startTime, 'success');
            logger.info({
                jobId: job.id,
                bookingId: webhookData.bookingId,
                duration: Date.now() - startTime
            }, 'Webhook job completed');
        }
        else if (data.type === 'single') {
            const singleData = data;
            await syncSingleBooking(singleData.bookingId);
            metricsHelpers.recordJobComplete(data.type, startTime, 'success');
            logger.info({
                jobId: job.id,
                bookingId: singleData.bookingId,
                duration: Date.now() - startTime
            }, 'Single sync job completed');
        }
        else if (data.type === 'cancelled') {
            const bulkData = data;
            await syncCancelledReservations(bulkData.dateFrom, bulkData.dateTo);
            metricsHelpers.recordJobComplete(data.type, startTime, 'success');
            metricsHelpers.recordReservationSync('cancelled', 'success');
            logger.info({
                jobId: job.id,
                dateFrom: bulkData.dateFrom,
                dateTo: bulkData.dateTo,
                duration: Date.now() - startTime
            }, 'Cancelled sync completed');
        }
        else if (data.type === 'leads') {
            const bulkData = data;
            await syncLeadsAndConfirmed(bulkData.dateFrom, bulkData.dateTo);
            metricsHelpers.recordJobComplete(data.type, startTime, 'success');
            metricsHelpers.recordReservationSync('leads', 'success');
            logger.info({
                jobId: job.id,
                dateFrom: bulkData.dateFrom,
                dateTo: bulkData.dateTo,
                duration: Date.now() - startTime
            }, 'Leads sync completed');
        }
        else if (data.type === 'whapi') {
            const whapiData = data;
            logger.info({
                jobId: job.id,
                webhookType: whapiData.webhookType,
                duration: Date.now() - startTime
            }, 'Whapi webhook processed (placeholder)');
            metricsHelpers.recordJobComplete(data.type, startTime, 'success');
        }
        else {
            throw new Error(`Unknown job type: ${data.type}`);
        }
    }
    catch (error) {
        metricsHelpers.recordJobComplete(data.type, startTime, 'failed');
        logger.error({
            jobId: job.id,
            error: error.message,
            stack: error.stack,
            duration: Date.now() - startTime
        }, 'Job failed');
        throw error;
    }
}, {
    connection: redis,
    concurrency: 2,
    limiter: {
        max: 5,
        duration: 1000,
    },
});
beds24Worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Job completed successfully');
});
beds24Worker.on('failed', async (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        logger.error({
            jobId: job.id,
            error: err.message,
            attempts: job.attemptsMade
        }, 'Job moved to DLQ after max attempts');
        await deadLetterQueue.add('failed-job', {
            originalJob: job.data,
            error: err.message,
            stack: err.stack,
            failedAt: new Date(),
            attempts: job.attemptsMade,
        });
    }
    else {
        logger.warn({
            jobId: job?.id,
            error: err.message,
            attempt: job?.attemptsMade || 0
        }, 'Job failed, will retry');
    }
});
beds24Worker.on('error', (err) => {
    if (err.message && err.message.includes('Command timed out')) {
        logger.debug({ error: err.message }, 'Worker polling timeout (benign)');
        return;
    }
    logger.error({ error: err.message }, 'Worker error');
});
export async function addWebhookJob(data, options) {
    const jobData = { type: 'webhook', ...data };
    const job = await beds24Queue.add('webhook', jobData, {
        priority: 1,
        ...options,
    });
    logger.info({
        jobId: job.id,
        bookingId: data.bookingId,
        action: data.action
    }, 'Webhook job queued');
    return job;
}
export async function addSingleSyncJob(data, options) {
    const jobData = { type: 'single', ...data };
    const job = await beds24Queue.add('single', jobData, {
        priority: 3,
        ...options,
    });
    logger.info({
        jobId: job.id,
        bookingId: data.bookingId
    }, 'Single sync job queued');
    return job;
}
export async function addBulkSyncJob(data, options) {
    const job = await beds24Queue.add('bulk-sync', data, {
        priority: 5,
        ...options,
    });
    logger.info({
        jobId: job.id,
        type: data.type,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo
    }, 'Bulk sync job queued');
    return job;
}
export async function getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
        beds24Queue.getWaitingCount(),
        beds24Queue.getActiveCount(),
        beds24Queue.getCompletedCount(),
        beds24Queue.getFailedCount(),
        beds24Queue.getDelayedCount(),
    ]);
    const stats = {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
    };
    await metricsHelpers.updateQueueMetrics(stats);
    return stats;
}
export async function getJobById(jobId) {
    const job = await beds24Queue.getJob(jobId);
    return job || null;
}
export async function retryFailedJobs() {
    const failedJobs = await beds24Queue.getFailed();
    logger.info({ count: failedJobs.length }, 'Retrying failed jobs');
    for (const job of failedJobs) {
        await job.retry();
    }
}
export async function cleanOldJobs() {
    await beds24Queue.clean(24 * 60 * 60 * 1000, 100, 'completed');
    await beds24Queue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed');
    logger.info('Old jobs cleaned up');
}
export async function closeQueues() {
    logger.info('Closing queues and worker...');
    await Promise.all([
        beds24Worker.close(),
        beds24Queue.close(),
        deadLetterQueue.close(),
    ]);
    logger.info('Queues closed successfully');
}
