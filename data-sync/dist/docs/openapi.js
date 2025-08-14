import swaggerJSDoc from 'swagger-jsdoc';
import { env } from '../config/env.js';
const options = {
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
        './src/docs/paths.yaml',
    ],
};
export const swaggerSpec = swaggerJSDoc(options);
export default swaggerSpec;
