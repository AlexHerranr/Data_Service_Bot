import { Queue, Worker, QueueScheduler } from 'bullmq';
import { redis } from '../redis/redis.client';
import { logger } from '../../utils/logger';
import { syncSingleBooking, syncCancelledReservations, syncLeadsAndConfirmed } from '../../providers/beds24/sync';
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
new QueueScheduler('beds24-sync', { connection: redis });
export const beds24Worker = new Worker('beds24-sync', async (job) => {
    const { data } = job;
    const startTime = Date.now();
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
            logger.info({
                jobId: job.id,
                bookingId: webhookData.bookingId,
                duration: Date.now() - startTime
            }, 'Webhook job completed');
        }
        else if (data.type === 'single') {
            const singleData = data;
            await syncSingleBooking(singleData.bookingId);
            logger.info({
                jobId: job.id,
                bookingId: singleData.bookingId,
                duration: Date.now() - startTime
            }, 'Single sync job completed');
        }
        else if (data.type === 'cancelled') {
            const bulkData = data;
            await syncCancelledReservations(bulkData.dateFrom, bulkData.dateTo);
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
            logger.info({
                jobId: job.id,
                dateFrom: bulkData.dateFrom,
                dateTo: bulkData.dateTo,
                duration: Date.now() - startTime
            }, 'Leads sync completed');
        }
        else {
            throw new Error(`Unknown job type: ${data.type}`);
        }
    }
    catch (error) {
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
    concurrency: 5,
    limiter: {
        max: 10,
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
    return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
    };
}
export async function getJobById(jobId) {
    return await beds24Queue.getJob(jobId);
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
