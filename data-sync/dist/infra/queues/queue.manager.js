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
    logger.warn({
        event: 'WORKER_PROCESSING_JOB',
        jobId: job.id,
        jobName: job.name,
        data: job.data,
        timestamp: new Date().toISOString()
    }, `WORKER ACTIVE: Processing job ${job.id}`);
    const { data } = job;
    const startTime = metricsHelpers.recordJobStart(data.type);
    const jobCreatedAt = new Date(job.timestamp);
    const jobProcessedAt = new Date();
    const delayMs = jobProcessedAt.getTime() - jobCreatedAt.getTime();
    logger.info({
        jobId: job.id,
        type: data.type,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 3,
        createdAt: jobCreatedAt.toISOString(),
        processedAt: jobProcessedAt.toISOString(),
        actualDelayMs: delayMs,
        actualDelayMinutes: (delayMs / 60000).toFixed(2),
        scheduledDelay: job.opts.delay || 0,
        delayReason: data.delayReason || 'none'
    }, '🚀 STEP 1: Processing job started');
    logger.info({ jobId: job.id, data }, '📊 STEP 2: Job data received');
    try {
        logger.info({ jobId: job.id }, '🔍 STEP 3: Starting job type detection');
        if (data.type === 'webhook' || data.type === 'beds24-webhook') {
            logger.info({ jobId: job.id, type: data.type }, '📨 STEP 4: Detected webhook job type');
            const webhookData = data;
            const bookingId = webhookData.bookingId || webhookData.payload?.id;
            const action = webhookData.action || webhookData.payload?.action || 'MODIFY';
            logger.info({
                jobId: job.id,
                bookingId,
                action,
                webhookDataKeys: Object.keys(webhookData)
            }, '🔑 STEP 5: Extracted webhook data');
            if (!bookingId) {
                logger.error({ jobId: job.id, webhookData }, '❌ STEP 5.1: No booking ID found in webhook data');
                throw new Error('No booking ID found in webhook data');
            }
            logger.info({
                jobId: job.id,
                bookingId,
                action,
                webhookType: data.type
            }, '🎯 STEP 6: Processing Beds24 webhook');
            logger.info({ jobId: job.id, bookingId, action }, '🔄 STEP 7: Starting syncSingleBooking call');
            const actualDelay = jobProcessedAt.getTime() - jobCreatedAt.getTime();
            logger.info({
                jobId: job.id,
                bookingId,
                actualDelayMs: actualDelay,
                actualDelayMinutes: (actualDelay / 60000).toFixed(2),
                expectedDelayMinutes: 1,
                delayReason: data.delayReason || 'standard-1-minute-delay'
            }, '⏱️ Processing booking change after delay');
            logger.info({ jobId: job.id, bookingId }, '📡 STEP 8: Calling syncSingleBooking function');
            const syncResult = await syncSingleBooking(bookingId);
            logger.info({
                jobId: job.id,
                bookingId,
                syncResult,
                success: syncResult.success,
                action: syncResult.action,
                table: syncResult.table
            }, '📋 STEP 9: syncSingleBooking completed');
            if (!syncResult.success) {
                logger.error({
                    jobId: job.id,
                    bookingId,
                    syncResult
                }, '❌ STEP 9.1: Sync failed, will throw error');
                throw new Error(`Sync failed: ${syncResult.action} - ${syncResult.table}`);
            }
            logger.info({ jobId: job.id, bookingId }, '✅ STEP 10: Sync success verified');
            logger.info({ jobId: job.id }, '📊 STEP 12: Recording metrics');
            metricsHelpers.recordJobComplete(data.type, startTime, 'success');
            const processingTime = Date.now() - startTime;
            logger.info({
                event: 'JOB_COMPLETED',
                jobId: job.id,
                bookingId: bookingId,
                syncResult: syncResult.action,
                syncSuccess: syncResult.success,
                processingTimeMs: processingTime,
                processingTimeSec: parseFloat((processingTime / 1000).toFixed(2)),
                timestamp: new Date().toISOString()
            }, `Job completed: ${bookingId} - ${syncResult.action} in ${(processingTime / 1000).toFixed(2)}s`);
            logger.info({
                jobId: job.id,
                bookingId,
                action,
                duration: processingTime
            }, '🎉 STEP 13: Beds24 webhook job completed successfully');
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
            step: 'sync_phase',
            bookingId: ('bookingId' in data && data.bookingId) ? data.bookingId : 'unknown',
            action: ('action' in data && data.action) ? data.action : 'unknown',
            duration: Date.now() - startTime
        }, '❌ Job processing failed at sync');
        throw error;
    }
}, {
    connection: redis,
    concurrency: 1,
    stalledInterval: 30000,
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
beds24Worker.on('ready', () => {
    logger.warn({
        event: 'WORKER_READY',
        workerName: 'beds24-sync',
        concurrency: 1,
        timestamp: new Date().toISOString()
    }, 'WORKER READY: Beds24 worker initialized and ready to process jobs');
});
beds24Worker.on('active', (job) => {
    logger.warn({
        event: 'WORKER_JOB_ACTIVE',
        jobId: job.id,
        bookingId: job.data.bookingId || 'N/A',
        jobType: job.data.type,
        timestamp: new Date().toISOString()
    }, `WORKER ACTIVE: Job ${job.id} started processing`);
});
beds24Worker.on('error', (err) => {
    if (err.message && err.message.includes('Command timed out')) {
        logger.debug({ error: err.message }, 'Worker polling timeout (benign)');
        return;
    }
    logger.error({ error: err.message }, 'Worker error');
});
export async function addWebhookJob(data, options) {
    const jobData = {
        type: 'beds24-webhook',
        timestamp: new Date(),
        priority: 'high',
        ...data
    };
    const jobId = `beds24-sync-${data.bookingId}`;
    const [existingJob, delayedJobs, activeJobs] = await Promise.all([
        beds24Queue.getJob(jobId),
        beds24Queue.getDelayed(),
        beds24Queue.getActive()
    ]);
    const existingDelayed = delayedJobs.find(j => j.id === jobId);
    const existingActive = activeJobs.find(j => j.id === jobId);
    if (existingDelayed || existingActive || (existingJob && !existingJob.isCompleted() && !existingJob.isFailed())) {
        logger.warn({
            bookingId: data.bookingId,
            existingJobId: jobId,
            isDelayed: !!existingDelayed,
            isActive: !!existingActive,
            isWaiting: !!(existingJob && !existingJob.isCompleted() && !existingJob.isFailed())
        }, 'Job already exists for this booking - removing old and creating new');
        if (existingDelayed)
            await existingDelayed.remove();
        if (existingJob)
            await existingJob.remove();
    }
    logger.warn({
        event: 'ADDING_JOB_TO_QUEUE',
        jobId: jobId,
        bookingId: data.bookingId,
        queueName: 'beds24-sync',
        delay: options?.delay || 0,
        timestamp: new Date().toISOString()
    }, `ADDING job ${jobId} to queue with delay ${options?.delay || 0}ms`);
    try {
        const job = await beds24Queue.add('webhook', jobData, {
            priority: 1,
            jobId,
            ...options,
        });
        logger.warn({
            event: 'JOB_ADDED_TO_QUEUE',
            jobId: job.id,
            jobName: job.name,
            queueName: job.queueName,
            delay: job.opts.delay || 0,
            timestamp: new Date().toISOString()
        }, `JOB ADDED: ${job.id} to queue ${job.queueName}`);
        logger.info({
            jobId: job.id,
            bookingId: jobData.bookingId || jobData.payload?.id,
            action: jobData.action || jobData.payload?.action,
            delay: options?.delay || 0,
            delayMinutes: options?.delay ? (options.delay / 60000).toFixed(2) : 0,
            scheduledFor: options?.delay ? new Date(Date.now() + options.delay).toISOString() : 'immediate',
            delayReason: jobData.delayReason || 'none'
        }, 'Webhook job queued');
        return job;
    }
    catch (error) {
        logger.error({
            event: 'JOB_ADD_FAILED',
            jobId: jobId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }, `FAILED to add job ${jobId}: ${error.message}`);
        throw error;
    }
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
