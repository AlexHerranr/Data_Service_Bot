import swaggerJSDoc from 'swagger-jsdoc';
import { env } from '../config/env.js';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Bot Data Service API',
      version: '1.0.0',
      description: 'Multi-source data synchronization service for TeAlquilamos WhatsApp Bot',
      contact: {
        name: 'Bot Data Service Support',
        email: 'support@tealquilamos.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Development server',
      },
      {
        url: 'https://your-railway-app.railway.app',
        description: 'Production server (Railway)',
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
      {
        name: 'Webhooks',
        description: 'Webhook endpoints for external integrations',
      },
      {
        name: 'Admin',
        description: 'Administrative endpoints for queue management',
      },
      {
        name: 'Monitoring',
        description: 'Metrics and monitoring endpoints',
      },
    ],
    components: {
      schemas: {
        HealthResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'unhealthy'],
              description: 'Overall system health status',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Health check timestamp',
            },
            response_time_ms: {
              type: 'number',
              description: 'Health check response time in milliseconds',
            },
            services: {
              type: 'object',
              properties: {
                redis: {
                  type: 'string',
                  enum: ['connected', 'disconnected', 'unknown'],
                },
                database: {
                  type: 'string',
                  enum: ['connected', 'disconnected', 'unknown'],
                },
              },
            },
            queues: {
              type: 'object',
              properties: {
                'beds24-sync': {
                  $ref: '#/components/schemas/QueueStats',
                },
              },
            },
            version: {
              type: 'string',
              description: 'Application version',
            },
            environment: {
              type: 'string',
              description: 'Environment name',
            },
          },
        },
        QueueStats: {
          type: 'object',
          properties: {
            waiting: {
              type: 'number',
              description: 'Number of jobs waiting to be processed',
            },
            active: {
              type: 'number',
              description: 'Number of jobs currently being processed',
            },
            failed: {
              type: 'number',
              description: 'Number of failed jobs',
            },
            total: {
              type: 'number',
              description: 'Total number of jobs',
            },
          },
        },
        WebhookRequest: {
          type: 'object',
          required: ['bookingId', 'action'],
          properties: {
            bookingId: {
              type: 'string',
              description: 'Unique booking identifier from Beds24',
              example: 'BK123456',
            },
            action: {
              type: 'string',
              enum: ['created', 'modified', 'cancelled'],
              description: 'Type of action performed on the booking',
            },
            status: {
              type: 'string',
              description: 'Additional status information',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'When the action occurred',
            },
          },
        },
        WebhookResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['accepted', 'rejected'],
            },
            message: {
              type: 'string',
              description: 'Response message',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        QueueStatsResponse: {
          type: 'object',
          properties: {
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
            redis: {
              type: 'string',
              enum: ['connected', 'disconnected'],
            },
            queues: {
              type: 'object',
              properties: {
                'beds24-sync': {
                  $ref: '#/components/schemas/QueueStats',
                },
                'beds24-dlq': {
                  type: 'object',
                  properties: {
                    failed_jobs: {
                      type: 'number',
                    },
                  },
                },
              },
            },
            health: {
              type: 'string',
              enum: ['ok', 'degraded', 'critical'],
            },
          },
        },
        JobDetails: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Job ID',
            },
            name: {
              type: 'string',
              description: 'Job name',
            },
            data: {
              type: 'object',
              description: 'Job data payload',
            },
            progress: {
              type: 'number',
              description: 'Job progress percentage',
            },
            attemptsMade: {
              type: 'number',
              description: 'Number of attempts made',
            },
            finishedOn: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            processedOn: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            failedReason: {
              type: 'string',
              nullable: true,
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
            message: {
              type: 'string',
              description: 'Detailed error message',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
      securitySchemes: {
        HmacAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Signature',
          description: 'HMAC signature for webhook authentication',
        },
      },
    },
  },
  apis: [
    './src/server/routes/**/*.ts',
    './src/docs/paths.yaml', // Additional path definitions
  ],
};

export const swaggerSpec = swaggerJSDoc(options);

// Path definitions using JSDoc comments
/**
 * @swagger
 * /:
 *   get:
 *     summary: Get service information
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                   example: data-sync
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 endpoints:
 *                   type: object
 *                   description: Available endpoints
 */

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: System is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/webhooks/beds24:
 *   post:
 *     summary: Receive webhook from Beds24
 *     tags: [Webhooks]
 *     security:
 *       - HmacAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebhookRequest'
 *     responses:
 *       200:
 *         description: Webhook accepted and queued for processing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookResponse'
 *       400:
 *         description: Invalid webhook data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/webhooks/whapi:
 *   post:
 *     summary: Receive webhook from Whapi
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, data]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [message, message_status, client_ready]
 *                 description: Type of Whapi event
 *                 example: message
 *               data:
 *                 type: object
 *                 description: Event data payload
 *                 example: {"from": "1234567890", "text": "Hello"}
 *     responses:
 *       200:
 *         description: Webhook accepted and queued for processing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookResponse'
 *       400:
 *         description: Invalid webhook data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/admin/queues/stats:
 *   get:
 *     summary: Get queue statistics
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Queue statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QueueStatsResponse'
 *       500:
 *         description: Failed to get queue stats
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/admin/queues/jobs/{jobId}:
 *   get:
 *     summary: Get job details by ID
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobDetails'
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to get job details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/admin/queues/retry-failed:
 *   post:
 *     summary: Retry all failed jobs
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Failed jobs retry initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Failed to retry jobs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/admin/queues/clean:
 *   post:
 *     summary: Clean old completed and failed jobs
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Old jobs cleanup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Failed to clean jobs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/admin/queues/health:
 *   get:
 *     summary: Get queue health summary
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Queues are healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded]
 *                 queues:
 *                   type: object
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: Queues are unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics endpoint
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Prometheus metrics in text format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: |
 *                 # HELP data_sync_jobs_processed_total Total number of jobs processed
 *                 # TYPE data_sync_jobs_processed_total counter
 *                 data_sync_jobs_processed_total{type="webhook",status="success"} 42
 *       500:
 *         description: Failed to generate metrics
 */

export default swaggerSpec;