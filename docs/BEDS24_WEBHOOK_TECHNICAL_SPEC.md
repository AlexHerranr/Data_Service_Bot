# Especificación Técnica - Webhooks Beds24

## Arquitectura de Componentes

### Diagrama de Flujo
```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│   Beds24    │───▶│   Webhook    │───▶│    Queue    │───▶│  Sync Worker │
│   Server    │    │   Endpoint   │    │  (BullMQ)   │    │   Process    │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
                           │                    │                    │
                           ▼                    ▼                    ▼
                   ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
                   │  Immediate   │    │    Redis    │    │ PostgreSQL   │
                   │   Response   │    │   Storage   │    │   Database   │
                   └──────────────┘    └─────────────┘    └──────────────┘
```

## Implementación del Webhook

### Archivo: `beds24.route.ts`

#### Endpoint Principal
```typescript
router.post('/webhooks/beds24', verifyHmac, async (req, res) => {
  // Procesamiento del webhook
});
```

#### Validación de Payload
```typescript
const { booking, timeStamp } = req.body;

if (!booking || !booking.id) {
  return res.status(400).json({ 
    error: 'Missing required fields: booking.id',
    received: false
  });
}
```

#### Extracción de Datos
```typescript
const bookingId = String(booking.id);
const status = booking.status || 'unknown';

// Determinación inteligente de acción
let action = 'created';
if (booking.cancelTime) {
  action = 'cancelled';
} else if (booking.modifiedTime && booking.bookingTime !== booking.modifiedTime) {
  action = 'modified';
}

// Verificación adicional por status
if (status?.toLowerCase().includes('cancel') || 
    status?.toLowerCase().includes('deleted')) {
  action = 'cancelled';
}
```

## Sistema de Colas

### Archivo: `queue.manager.ts`

#### Configuración de Cola
```typescript
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

export const beds24Queue = new Queue<JobData>('beds24-sync', QUEUE_CONFIG);
```

#### Worker Configuration
```typescript
export const beds24Worker = new Worker<JobData>(
  'beds24-sync',
  async (job: Job<JobData>) => {
    // Procesamiento del job
  },
  {
    connection: redis,
    concurrency: 2,  // Optimizado para Railway
    limiter: {
      max: 5,
      duration: 1000,  // 5 jobs por segundo
    },
  }
);
```

## Tipos de Datos

### Archivo: `jobs.types.ts`

#### WebhookJob Interface
```typescript
export interface WebhookJob {
  type: 'webhook';
  bookingId: string;
  action: 'created' | 'modified' | 'cancelled';
  timestamp: Date;
  priority: 'high' | 'normal' | 'low';
}
```

#### JobData Union Type
```typescript
export type JobData = WebhookJob | BulkSyncJob | SingleSyncJob | WhapiJob;
```

## Procesamiento de Sincronización

### Archivo: `sync.ts`

#### Función Principal
```typescript
export async function syncSingleBooking(bookingId: string): Promise<void> {
  try {
    // 1. Fetch data from Beds24 API
    const bookingData = await beds24Client.getBooking(bookingId);
    
    // 2. Transform data
    const transformedData = transformBookingData(bookingData);
    
    // 3. Upsert to database
    await prisma.reservas.upsert({
      where: { bookingId },
      update: transformedData,
      create: transformedData,
    });
    
    logger.info({ bookingId }, 'Booking synced successfully');
  } catch (error) {
    logger.error({ bookingId, error: error.message }, 'Sync failed');
    throw error;
  }
}
```

#### Transformación de Datos
```typescript
function transformBookingData(beds24Data: any) {
  return {
    bookingId: String(beds24Data.id),
    status: beds24Data.status,
    guestName: beds24Data.guestName || beds24Data.reference,
    phone: extractPhoneFromReference(beds24Data.apiReference),
    propertyName: mapPropertyId(beds24Data.propertyId),
    arrivalDate: beds24Data.arrival,
    departureDate: beds24Data.departure,
    totalPersons: (beds24Data.numAdult || 0) + (beds24Data.numChild || 0),
    totalCharges: String(beds24Data.price || 0),
    channel: beds24Data.channel,
    bookingDate: beds24Data.bookingTime,
    modifiedDate: beds24Data.modifiedTime,
    lastUpdatedBD: new Date(),
    raw: beds24Data,  // Store complete payload
  };
}
```

## Manejo de Errores

### Error Handlers en Worker
```typescript
beds24Worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
    // Move to Dead Letter Queue
    await deadLetterQueue.add('failed-job', {
      originalJob: job.data,
      error: err.message,
      stack: err.stack,
      failedAt: new Date(),
      attempts: job.attemptsMade,
    });
    
    logger.error({ 
      jobId: job.id, 
      error: err.message 
    }, 'Job moved to DLQ after max attempts');
  }
});
```

### Error Handling en Webhook
```typescript
try {
  // Processing logic
} catch (error: any) {
  logger.error({ 
    error: error.message,
    body: req.body
  }, 'Webhook processing error');
  
  res.status(500).json({ 
    error: 'Internal server error',
    received: false
  });
}
```

## Logging y Métricas

### Structured Logging
```typescript
// Webhook received
logger.info({ 
  type: 'beds24:webhook', 
  bookingId, 
  action, 
  status,
  propertyId: booking.propertyId,
  arrival: booking.arrival,
  departure: booking.departure
}, 'Beds24 webhook received');

// Job processing
logger.info({ 
  jobId: job.id, 
  bookingId, 
  action,
  duration: Date.now() - startTime
}, 'Webhook job completed');
```

### Prometheus Metrics
```typescript
// En metricsHelpers
recordWebhook(source: string, action: string) {
  this.webhookCounter.labels(source, action).inc();
}

recordJobComplete(type: string, startTime: number, status: 'success' | 'failed') {
  const duration = Date.now() - startTime;
  this.jobDuration.labels(type, status).observe(duration / 1000);
  this.jobCounter.labels(type, status).inc();
}
```

## Configuración de Seguridad

### HMAC Verification (TODO)
```typescript
function verifyHmac(req: Request, res: Response, next: Function) {
  const signature = req.headers['x-beds24-signature'] || 
                   req.headers['authorization'];
  
  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' });
  }
  
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', process.env.BEDS24_WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex');
  
  if (signature !== `sha256=${expectedSignature}`) {
    return res.status(403).json({ error: 'Invalid signature' });
  }
  
  next();
}
```

## Optimizaciones de Performance

### Connection Pooling
```typescript
// Redis connection optimization
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: true,
  keepAlive: 30000,
  family: 0,  // IPv4/IPv6 support for Railway
});
```

### Database Connection
```typescript
// Prisma optimization
const prisma = new PrismaClient({
  log: ['error', 'warn'],
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
});
```

## Testing y Debugging

### Unit Tests Structure
```typescript
describe('Beds24 Webhook', () => {
  test('should process valid webhook', async () => {
    const payload = {
      timeStamp: new Date().toISOString(),
      booking: {
        id: 12345,
        status: 'confirmed',
        bookingTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString(),
      }
    };
    
    const response = await request(app)
      .post('/api/webhooks/beds24')
      .send(payload)
      .expect(200);
    
    expect(response.body.status).toBe('accepted');
  });
});
```

### Integration Tests
```typescript
describe('End-to-end Webhook Processing', () => {
  test('should sync booking to database', async () => {
    // Mock Beds24 API response
    jest.spyOn(beds24Client, 'getBooking').mockResolvedValue(mockBookingData);
    
    // Send webhook
    await request(app).post('/api/webhooks/beds24').send(webhookPayload);
    
    // Wait for job processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify database update
    const booking = await prisma.reservas.findUnique({
      where: { bookingId: '12345' }
    });
    
    expect(booking).toBeTruthy();
    expect(booking.status).toBe('confirmed');
  });
});
```

## Deployment Configuration

### Railway Environment Variables
```env
# Beds24 API
BEDS24_TOKEN=your-api-token
BEDS24_API_URL=https://api.beds24.com/v2

# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# Webhook Security
BEDS24_WEBHOOK_SECRET=your-webhook-secret

# Monitoring
PROMETHEUS_ENABLED=true
LOG_LEVEL=info
```

### Railway railway.json
```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "cd data-sync && npm ci && npm run build"
  },
  "deploy": {
    "startCommand": "cd data-sync && npm run start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

---

## Checklist de Implementación

- [x] Webhook endpoint configurado
- [x] Queue system operativo
- [x] Worker processing implementado
- [x] Error handling robusto
- [x] Logging estructurado
- [x] Métricas básicas
- [ ] HMAC verification
- [ ] Rate limiting
- [ ] Comprehensive testing
- [ ] Production monitoring alerts