import { config } from 'dotenv';
import { z } from 'zod';
config();
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string(),
    BEDS24_API_URL: z.string().url().default('https://api.beds24.com/v2'),
    BEDS24_TOKEN: z.string().min(1),
    BEDS24_READ_REFRESH_TOKEN: z.string().optional(),
    BEDS24_WRITE_REFRESH_TOKEN: z.string().optional(),
    BEDS24_INVITE_CODE_READ: z.string().optional(),
    BEDS24_INVITE_CODE_WRITE: z.string().optional(),
    BEDS24_WEBHOOK_TOKEN: z.string().optional(),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'development']).transform((val) => val === 'development' ? 'debug' : val),
    LOG_PRETTY: z.coerce.boolean().default(false),
    PROMETHEUS_ENABLED: z.coerce.boolean().default(true),
    SWAGGER_ENABLED: z.coerce.boolean().default(true),
    METRICS_PREFIX: z.string().default('data_sync_'),
});
function parseEnv() {
    try {
        return envSchema.parse(process.env);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            console.error('❌ Invalid environment configuration:');
            error.errors.forEach(err => {
                console.error(`  - ${err.path.join('.')}: ${err.message}`);
            });
            console.error('\n📋 Required environment variables:');
            console.error('  - DATABASE_URL: PostgreSQL connection string');
            console.error('  - BEDS24_TOKEN: Long life token from Beds24 API settings (legacy)');
            console.error('  - BEDS24_READ_REFRESH_TOKEN: Refresh token for read operations (optional)');
            console.error('  - BEDS24_WRITE_REFRESH_TOKEN: Refresh token for write operations (optional)');
            console.error('  - BEDS24_API_URL: Beds24 API URL (optional, defaults to v2)');
            console.error('  - REDIS_URL: Redis connection string (optional, defaults to localhost)');
            process.exit(1);
        }
        throw error;
    }
}
export const env = parseEnv();
