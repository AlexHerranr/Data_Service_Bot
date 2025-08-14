import { z } from 'zod';
export const WebhookJobSchema = z.object({
    type: z.literal('webhook'),
    bookingId: z.string().min(1),
    action: z.enum(['created', 'modified', 'cancelled']),
    timestamp: z.date().default(() => new Date()),
    priority: z.enum(['low', 'normal', 'high']).default('high'),
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
