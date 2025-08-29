import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../redis/redis.client.js';
import { logger } from '../../utils/logger.js';
import { 
  JobData, 
  WebhookJob, 
  BulkSyncJob, 
  SingleSyncJob,
  WhapiJob,
  QueueStats,
  QueueJobOptions
} from '../../types/jobs.types.js';
import { 
  syncSingleBooking, 
  syncCancelledReservations, 
  syncLeadsAndConfirmed 
} from '../../providers/beds24/sync.js';
import { metricsHelpers } from '../metrics/prometheus.js';

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
    
    // Log detallado del timing del job
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
      delayReason: (data as any).delayReason || 'none'
    }, '🚀 STEP 1: Processing job started');
    
    logger.info({ jobId: job.id, data }, '📊 STEP 2: Job data received');

    try {
      logger.info({ jobId: job.id }, '🔍 STEP 3: Starting job type detection');
      
      if (data.type === 'webhook' || data.type === 'beds24-webhook') {
        logger.info({ jobId: job.id, type: data.type }, '📨 STEP 4: Detected webhook job type');
        
        const webhookData = data as any; // Flexible para nuevos webhooks
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

        // Beds24 V2: Todo es un cambio de reserva (nueva o modificación)
        // El upsert en la BD maneja automáticamente si es crear o actualizar
        const actualDelay = jobProcessedAt.getTime() - jobCreatedAt.getTime();
        logger.info({ 
          jobId: job.id, 
          bookingId,
          actualDelayMs: actualDelay,
          actualDelayMinutes: (actualDelay / 60000).toFixed(2),
          expectedDelayMinutes: 1,
          delayReason: (data as any).delayReason || 'standard-1-minute-delay'
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
        
        // ✅ VERIFICAR SUCCESS antes de marcar como completado
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
        
        logger.info({ 
          jobId: job.id, 
          bookingId,
          action,
          duration: Date.now() - startTime
        }, '🎉 STEP 13: Beds24 webhook job completed successfully');
        
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
        step: 'sync_phase',
        bookingId: ('bookingId' in data && data.bookingId) ? data.bookingId : 'unknown',
        action: ('action' in data && data.action) ? data.action : 'unknown',
        duration: Date.now() - startTime
      }, '❌ Job processing failed at sync');
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1, // Procesamiento secuencial para mantener orden FIFO
    stalledInterval: 30000, // 30s default explicit per docs
    limiter: {
      max: 5,
      duration: 1000, // 5 jobs por segundo
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

beds24Worker.on('ready', () => {
  logger.info('✅ Beds24 worker ready to process jobs');
});

beds24Worker.on('error', (err) => {
  // Filtrar timeouts benignos de BullMQ (polling vacío)
  if (err.message && err.message.includes('Command timed out')) {
    logger.debug({ error: err.message }, 'Worker polling timeout (benign)');
    return;
  }
  
  // Solo loguear errores reales como error
  logger.error({ error: err.message }, 'Worker error');
});

// Funciones para agregar jobs
export async function addWebhookJob(
  data: Partial<WebhookJob> | any, 
  options?: QueueJobOptions
): Promise<Job> {
  // Flexible webhook job data
  const jobData = {
    type: 'beds24-webhook',
    timestamp: new Date(),
    priority: 'high' as const,
    ...data
  };
  
  // Deduplicación de jobs - evitar duplicados por bookingId
  const jobId = `beds24-sync-${data.bookingId}`;
  const existingJob = await beds24Queue.getJob(jobId);
  
  if (existingJob && !existingJob.isCompleted() && !existingJob.isFailed()) {
    // Si ya existe un job para esta reserva, verificar si es una modificación
    if (data.action === 'MODIFY' && options?.delay) {
      // Si es una modificación con delay, cancelar el job anterior y crear uno nuevo
      logger.info({ 
        bookingId: data.bookingId, 
        existingJobId: existingJob.id,
        newDelay: options.delay 
      }, 'Cancelling existing job and scheduling new MODIFY with delay');
      
      await existingJob.remove();
      // Continuar para crear el nuevo job con delay
    } else {
      logger.debug({ bookingId: data.bookingId, existingJobId: existingJob.id }, 'Skipping duplicate job');
      return existingJob;
    }
  }

  const job = await beds24Queue.add('webhook', jobData, {
    priority: 1, // Alta prioridad para webhooks
    jobId, // Usar jobId único para deduplicación
    ...options,
  });
  
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