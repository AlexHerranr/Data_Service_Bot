import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../redis/redis.client';
import { logger } from '../../utils/logger';
import { 
  JobData, 
  WebhookJob, 
  BulkSyncJob, 
  SingleSyncJob,
  WhapiJob,
  QueueStats,
  QueueJobOptions
} from '../../types/jobs.types';
import { 
  syncSingleBooking, 
  syncCancelledReservations, 
  syncLeadsAndConfirmed 
} from '../../providers/beds24/sync';
import { metricsHelpers } from '../metrics/prometheus';

// Configuración de colas
const QUEUE_CONFIG = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  }
};

// Colas principales
export const beds24Queue = new Queue<JobData>('beds24-sync', QUEUE_CONFIG);
export const deadLetterQueue = new Queue('beds24-dlq', { connection: redis });

// Nota: QueueScheduler no existe en BullMQ v5+, la funcionalidad está integrada en Queue

// Worker principal
export const beds24Worker = new Worker<JobData>(
  'beds24-sync',
  async (job: Job<JobData>) => {
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
        const webhookData = data as WebhookJob;
        await syncSingleBooking(webhookData.bookingId);
        metricsHelpers.recordJobComplete(data.type, startTime, 'success');
        logger.info({ 
          jobId: job.id, 
          bookingId: webhookData.bookingId,
          duration: Date.now() - startTime
        }, 'Webhook job completed');
        
      } else if (data.type === 'single') {
        const singleData = data as SingleSyncJob;
        await syncSingleBooking(singleData.bookingId);
        metricsHelpers.recordJobComplete(data.type, startTime, 'success');
        logger.info({ 
          jobId: job.id, 
          bookingId: singleData.bookingId,
          duration: Date.now() - startTime
        }, 'Single sync job completed');
        
      } else if (data.type === 'cancelled') {
        const bulkData = data as BulkSyncJob;
        await syncCancelledReservations(bulkData.dateFrom, bulkData.dateTo);
        metricsHelpers.recordJobComplete(data.type, startTime, 'success');
        metricsHelpers.recordReservationSync('cancelled', 'success');
        logger.info({ 
          jobId: job.id, 
          dateFrom: bulkData.dateFrom, 
          dateTo: bulkData.dateTo,
          duration: Date.now() - startTime
        }, 'Cancelled sync completed');
        
      } else if (data.type === 'leads') {
        const bulkData = data as BulkSyncJob;
        await syncLeadsAndConfirmed(bulkData.dateFrom, bulkData.dateTo);
        metricsHelpers.recordJobComplete(data.type, startTime, 'success');
        metricsHelpers.recordReservationSync('leads', 'success');
        logger.info({ 
          jobId: job.id, 
          dateFrom: bulkData.dateFrom, 
          dateTo: bulkData.dateTo,
          duration: Date.now() - startTime
        }, 'Leads sync completed');
        
      } else if (data.type === 'whapi') {
        const whapiData = data as WhapiJob;
        // TODO: Implement Whapi processing logic here
        logger.info({ 
          jobId: job.id, 
          webhookType: whapiData.webhookType,
          duration: Date.now() - startTime
        }, 'Whapi webhook processed (placeholder)');
        metricsHelpers.recordJobComplete(data.type, startTime, 'success');
        
      } else {
        throw new Error(`Unknown job type: ${(data as any).type}`);
      }
      
    } catch (error: any) {
      metricsHelpers.recordJobComplete(data.type, startTime, 'failed');
      logger.error({ 
        jobId: job.id, 
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime
      }, 'Job failed');
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000, // 10 jobs por segundo
    },
  }
);

// Event handlers para el worker
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
    
    // Mover a dead letter queue
    await deadLetterQueue.add('failed-job', {
      originalJob: job.data,
      error: err.message,
      stack: err.stack,
      failedAt: new Date(),
      attempts: job.attemptsMade,
    });
  } else {
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

// Funciones para agregar jobs
export async function addWebhookJob(
  data: Omit<WebhookJob, 'type'>, 
  options?: QueueJobOptions
): Promise<Job> {
  const jobData: WebhookJob = { type: 'webhook', ...data };
  
  const job = await beds24Queue.add('webhook', jobData, {
    priority: 1, // Alta prioridad para webhooks
    ...options,
  });
  
  logger.info({ 
    jobId: job.id,
    bookingId: data.bookingId,
    action: data.action
  }, 'Webhook job queued');
  
  return job;
}

export async function addSingleSyncJob(
  data: Omit<SingleSyncJob, 'type'>,
  options?: QueueJobOptions
): Promise<Job> {
  const jobData: SingleSyncJob = { type: 'single', ...data };
  
  const job = await beds24Queue.add('single', jobData, {
    priority: 3, // Prioridad media
    ...options,
  });
  
  logger.info({ 
    jobId: job.id,
    bookingId: data.bookingId
  }, 'Single sync job queued');
  
  return job;
}

export async function addBulkSyncJob(
  data: BulkSyncJob,
  options?: QueueJobOptions
): Promise<Job> {
  const job = await beds24Queue.add('bulk-sync', data, {
    priority: 5, // Menor prioridad para sync masivo
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

// Funciones de estadísticas y monitoreo
export async function getQueueStats(): Promise<QueueStats> {
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

  // Update Prometheus metrics
  await metricsHelpers.updateQueueMetrics(stats);

  return stats;
}

export async function getJobById(jobId: string): Promise<Job | null> {
  const job = await beds24Queue.getJob(jobId);
  return job || null;
}

export async function retryFailedJobs(): Promise<void> {
  const failedJobs = await beds24Queue.getFailed();
  logger.info({ count: failedJobs.length }, 'Retrying failed jobs');
  
  for (const job of failedJobs) {
    await job.retry();
  }
}

export async function cleanOldJobs(): Promise<void> {
  // Limpiar jobs completados > 24h
  await beds24Queue.clean(24 * 60 * 60 * 1000, 100, 'completed');
  // Limpiar jobs fallidos > 7 días
  await beds24Queue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed');
  
  logger.info('Old jobs cleaned up');
}

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  logger.info('Closing queues and worker...');
  
  await Promise.all([
    beds24Worker.close(),
    beds24Queue.close(),
    deadLetterQueue.close(),
  ]);
  
  logger.info('Queues closed successfully');
}