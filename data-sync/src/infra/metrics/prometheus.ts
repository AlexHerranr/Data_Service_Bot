import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

// Initialize Prometheus registry
if (env.PROMETHEUS_ENABLED) {
  // Collect default metrics (CPU, memory, etc.)
  collectDefaultMetrics({ 
    register,
    prefix: env.METRICS_PREFIX,
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  });
  
  logger.info('Prometheus metrics collection enabled');
}

// Custom metrics for data-sync
export const metrics = {
  // Job processing metrics
  jobsProcessed: new Counter({
    name: `${env.METRICS_PREFIX}jobs_processed_total`,
    help: 'Total number of jobs processed',
    labelNames: ['type', 'status'] as const,
    registers: [register],
  }),

  jobDuration: new Histogram({
    name: `${env.METRICS_PREFIX}job_duration_seconds`,
    help: 'Job processing duration in seconds',
    labelNames: ['type', 'status'] as const,
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300],
    registers: [register],
  }),

  // Queue metrics
  queueSize: new Gauge({
    name: `${env.METRICS_PREFIX}queue_size`,
    help: 'Current queue size by type',
    labelNames: ['queue', 'status'] as const,
    registers: [register],
  }),

  queueProcessingRate: new Gauge({
    name: `${env.METRICS_PREFIX}queue_processing_rate`,
    help: 'Jobs processed per minute',
    labelNames: ['queue'] as const,
    registers: [register],
  }),

  // Redis connection metrics
  redisConnections: new Gauge({
    name: `${env.METRICS_PREFIX}redis_connections`,
    help: 'Redis connection status',
    labelNames: ['status'] as const,
    registers: [register],
  }),

  // Database metrics
  databaseConnections: new Gauge({
    name: `${env.METRICS_PREFIX}database_connections`,
    help: 'Database connection status',
    labelNames: ['status'] as const,
    registers: [register],
  }),

  databaseQueryDuration: new Histogram({
    name: `${env.METRICS_PREFIX}database_query_duration_seconds`,
    help: 'Database query duration in seconds',
    labelNames: ['operation'] as const,
    buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
    registers: [register],
  }),

  // HTTP metrics (complementing express-prom-bundle)
  httpRequestsCustom: new Counter({
    name: `${env.METRICS_PREFIX}http_requests_custom_total`,
    help: 'Total custom HTTP requests',
    labelNames: ['method', 'endpoint', 'status_code'] as const,
    registers: [register],
  }),

  // Beds24 API metrics
  beds24ApiCalls: new Counter({
    name: `${env.METRICS_PREFIX}beds24_api_calls_total`,
    help: 'Total Beds24 API calls',
    labelNames: ['endpoint', 'status'] as const,
    registers: [register],
  }),

  beds24ApiDuration: new Histogram({
    name: `${env.METRICS_PREFIX}beds24_api_duration_seconds`,
    help: 'Beds24 API call duration in seconds',
    labelNames: ['endpoint'] as const,
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [register],
  }),

  // Business metrics
  reservationsSynced: new Counter({
    name: `${env.METRICS_PREFIX}reservations_synced_total`,
    help: 'Total reservations synced',
    labelNames: ['type', 'status'] as const,
    registers: [register],
  }),

  webhooksReceived: new Counter({
    name: `${env.METRICS_PREFIX}webhooks_received_total`,
    help: 'Total webhooks received',
    labelNames: ['source', 'action'] as const,
    registers: [register],
  }),

  // System health metrics
  systemHealth: new Gauge({
    name: `${env.METRICS_PREFIX}system_health`,
    help: 'System health status (1 = healthy, 0 = unhealthy)',
    labelNames: ['component'] as const,
    registers: [register],
  }),

  uptime: new Gauge({
    name: `${env.METRICS_PREFIX}uptime_seconds`,
    help: 'Application uptime in seconds',
    registers: [register],
  }),
};

// Helper functions for common metric operations
export const metricsHelpers = {
  recordJobStart: (type: string) => {
    return Date.now();
  },

  recordJobComplete: (type: string, startTime: number, status: 'success' | 'failed') => {
    const duration = (Date.now() - startTime) / 1000;
    metrics.jobsProcessed.inc({ type, status });
    metrics.jobDuration.observe({ type, status }, duration);
  },

  recordBeds24ApiCall: (endpoint: string, startTime: number, status: 'success' | 'error') => {
    const duration = (Date.now() - startTime) / 1000;
    metrics.beds24ApiCalls.inc({ endpoint, status });
    metrics.beds24ApiDuration.observe({ endpoint }, duration);
  },

  recordWebhook: (source: string, action: string) => {
    metrics.webhooksReceived.inc({ source, action });
  },

  recordReservationSync: (type: string, status: 'success' | 'failed') => {
    metrics.reservationsSynced.inc({ type, status });
  },

  updateQueueMetrics: async (queueStats: { waiting: number; active: number; failed: number; completed: number }) => {
    metrics.queueSize.set({ queue: 'beds24-sync', status: 'waiting' }, queueStats.waiting);
    metrics.queueSize.set({ queue: 'beds24-sync', status: 'active' }, queueStats.active);
    metrics.queueSize.set({ queue: 'beds24-sync', status: 'failed' }, queueStats.failed);
    metrics.queueSize.set({ queue: 'beds24-sync', status: 'completed' }, queueStats.completed);
  },

  updateConnectionStatus: (redis: boolean, database: boolean) => {
    metrics.redisConnections.set({ status: 'connected' }, redis ? 1 : 0);
    metrics.redisConnections.set({ status: 'disconnected' }, redis ? 0 : 1);
    metrics.databaseConnections.set({ status: 'connected' }, database ? 1 : 0);
    metrics.databaseConnections.set({ status: 'disconnected' }, database ? 0 : 1);
  },

  updateSystemHealth: (component: string, healthy: boolean) => {
    metrics.systemHealth.set({ component }, healthy ? 1 : 0);
  },

  recordHttpRequest: (method: string, endpoint: string, statusCode: number) => {
    metrics.httpRequestsCustom.inc({ 
      method, 
      endpoint: endpoint.replace(/\/\d+/g, '/:id'), // Normalize path params
      status_code: statusCode.toString()
    });
  },
};

// Initialize uptime tracking
const startTime = Date.now();
setInterval(() => {
  metrics.uptime.set((Date.now() - startTime) / 1000);
}, 10000); // Update every 10 seconds

// Export the registry for /metrics endpoint
export { register };

export default metrics;