import { z } from 'zod';

export const WebhookJobSchema = z.object({
  type: z.enum(['webhook', 'beds24-webhook']),
  bookingId: z.string().min(1).optional(),
  action: z.enum(['MODIFY']).default('MODIFY'), // Beds24 V2 solo notifica cambios
  timestamp: z.date().default(() => new Date()),
  priority: z.enum(['low', 'normal', 'high']).default('high'),
  payload: z.any().optional(), // Para webhooks flexibles
});

export const BulkSyncJobSchema = z.object({
  type: z.enum(['cancelled', 'leads']),
  dateFrom: z.string(),
  dateTo: z.string(),
  batchSize: z.number().default(50),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export const SingleSyncJobSchema = z.object({
  type: z.literal('single'),
  bookingId: z.string().min(1),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export const WhapiJobSchema = z.object({
  type: z.literal('whapi'),
  source: z.literal('whapi'),
  webhookType: z.string(),
  data: z.any(),
  timestamp: z.date().default(() => new Date()),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export type WebhookJob = z.infer<typeof WebhookJobSchema>;
export type BulkSyncJob = z.infer<typeof BulkSyncJobSchema>;
export type SingleSyncJob = z.infer<typeof SingleSyncJobSchema>;
export type WhapiJob = z.infer<typeof WhapiJobSchema>;

export type JobData = WebhookJob | BulkSyncJob | SingleSyncJob | WhapiJob;

// Job options para BullMQ
export interface QueueJobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: number;
  removeOnFail?: number;
}

// Resultados de stats
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}