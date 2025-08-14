import { Router, Request, Response } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { 
  beds24Queue, 
  deadLetterQueue, 
  getQueueStats,
  retryFailedJobs,
  cleanOldJobs,
  getJobById
} from '../../../infra/queues/queue.manager';
import { logger } from '../../../utils/logger';

// Bull Board UI Setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues/ui');

createBullBoard({
  queues: [
    new BullMQAdapter(beds24Queue),
    new BullMQAdapter(deadLetterQueue),
  ],
  serverAdapter,
});

export function registerQueuesRoute(router: Router): void {
  
  // API: Queue Statistics
  router.get('/admin/queues/stats', async (req: Request, res: Response) => {
    try {
      const stats = await getQueueStats();
      const dlqCount = await deadLetterQueue.getWaitingCount();
      
      res.json({
        timestamp: new Date().toISOString(),
        redis: 'connected',
        queues: {
          'beds24-sync': stats,
          'beds24-dlq': {
            failed_jobs: dlqCount,
          }
        },
        health: 'ok',
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get queue stats');
      res.status(500).json({ 
        error: 'Failed to get queue stats',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // API: Job Details
  router.get('/admin/queues/jobs/:jobId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;
      const job = await getJobById(jobId);
      
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json({
        id: job.id,
        name: job.name,
        data: job.data,
        opts: job.opts,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        returnvalue: job.returnvalue,
      });
    } catch (error: any) {
      logger.error({ error: error.message, jobId: req.params.jobId }, 'Failed to get job details');
      res.status(500).json({ 
        error: 'Failed to get job details',
        message: error.message 
      });
    }
  });

  // API: Retry Failed Jobs
  router.post('/admin/queues/retry-failed', async (req: Request, res: Response) => {
    try {
      await retryFailedJobs();
      logger.info('Manually triggered retry of failed jobs');
      res.json({ 
        message: 'Failed jobs retry initiated',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to retry jobs');
      res.status(500).json({ 
        error: 'Failed to retry jobs',
        message: error.message 
      });
    }
  });

  // API: Clean Old Jobs
  router.post('/admin/queues/clean', async (req: Request, res: Response) => {
    try {
      await cleanOldJobs();
      logger.info('Manually triggered cleanup of old jobs');
      res.json({ 
        message: 'Old jobs cleanup completed',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to clean jobs');
      res.status(500).json({ 
        error: 'Failed to clean jobs',
        message: error.message 
      });
    }
  });

  // API: Queue Health Summary
  router.get('/admin/queues/health', async (req: Request, res: Response) => {
    try {
      const stats = await getQueueStats();
      const isHealthy = stats.failed < 10 && stats.active < 100; // Basic health rules
      
      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'degraded',
        queues: {
          total_jobs: stats.total,
          active_jobs: stats.active,
          failed_jobs: stats.failed,
          waiting_jobs: stats.waiting,
        },
        alerts: [
          ...(stats.failed >= 10 ? ['High number of failed jobs'] : []),
          ...(stats.active >= 100 ? ['High number of active jobs'] : []),
        ],
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Bull Board Dashboard UI
  router.use('/admin/queues/ui', serverAdapter.getRouter());
  
  // Redirect convenience
  router.get('/admin/queues', (req: Request, res: Response) => {
    res.redirect('/admin/queues/ui');
  });
}