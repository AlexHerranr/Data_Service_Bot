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

#### Función Principal Implementada
```typescript
export async function syncSingleBooking(bookingId: string): Promise<{
  success: boolean;
  action: 'created' | 'updated' | 'skipped';
  table: 'Booking' | 'Leads' | 'ReservationsCancelled';
}> {
  try {
    logger.info({ bookingId }, 'Starting sync for booking');

    // 1. Fetch complete booking data from Beds24 API
    const client = getBeds24Client();
    const bookingData = await client.getBooking(bookingId);

    if (!bookingData) {
      logger.warn({ bookingId }, 'Booking not found in Beds24');
      return { success: false, action: 'skipped', table: 'Booking' };
    }

    logger.debug({ bookingId, bookingData }, 'Fetched complete booking data from API');

    // 2. Process the complete booking data with enhanced extraction
    return await processSingleBookingData(bookingData);

  } catch (error: any) {
    logger.error({ error: error.message, bookingId }, 'Failed to sync single booking');
    return { success: false, action: 'skipped', table: 'Booking' };
  }
}
```

#### Transformación de Datos Mejorada
```typescript
// En processSingleBookingData() - Extracción inteligente implementada
function extractEnhancedBookingData(bookingData: any) {
  // Enhanced guest information extraction
  const guestName = extractGuestName(bookingData);
  const phone = extractPhoneNumber(bookingData);
  const email = extractEmail(bookingData);

  // Enhanced booking data with more complete information
  return {
    bookingId: (bookingData.bookingId || bookingData.id)?.toString(),
    phone,
    guestName,
    status: bookingData.status || null,
    internalNotes: combineNotes(bookingData),
    propertyName: mapPropertyName(bookingData.propertyId) || bookingData.propertyName,
    arrivalDate: formatDateSimple(bookingData.arrival),
    departureDate: formatDateSimple(bookingData.departure),
    numNights: calculateNights(bookingData.arrival, bookingData.departure),
    totalPersons: calculateTotalPersons(bookingData),
    totalCharges: totalCharges.toString(),
    totalPayments: totalPayments.toString(),
    balance: balance.toString(),
    basePrice: bookingData.price || null,
    channel: determineChannel(bookingData),
    email,
    apiReference: bookingData.apiReference || null,
    charges: extractChargesAndPayments(bookingData).charges,
    payments: extractChargesAndPayments(bookingData).payments,
    messages: extractMessages(bookingData),
    infoItems: extractInfoItems(bookingData),
    notes: bookingData.comments || null,
    bookingDate: formatDateSimple(bookingData.created || bookingData.bookingTime),
    modifiedDate: formatDateSimple(bookingData.modified || bookingData.modifiedTime),
    lastUpdatedBD: new Date(),
    raw: bookingData, // Always store complete API response
    BDStatus: determineBDStatus(bookingData),
  };
}

// Funciones de extracción implementadas en utils.ts
export function extractGuestName(bookingData: any): string | null {
  if (bookingData.guestFirstName && bookingData.guestName) {
    return `${bookingData.guestFirstName} ${bookingData.guestName}`;
  }
  if (bookingData.firstName && bookingData.lastName) {
    return `${bookingData.firstName} ${bookingData.lastName}`;
  }
  return bookingData.guestName || bookingData.reference || null;
}

export function extractPhoneNumber(bookingData: any): string | null {
  // Direct phone field with cleaning
  if (bookingData.phone) {
    return cleanPhoneNumber(bookingData.phone);
  }
  
  // Extract from API reference (WhatsApp integration)
  if (bookingData.apiReference) {
    const phoneFromApi = extractPhoneFromApiReference(bookingData.apiReference);
    if (phoneFromApi) return phoneFromApi;
  }
  
  // Regex extraction from comments/notes
  const phoneFromNotes = extractPhoneFromText(
    `${bookingData.comments || ''} ${bookingData.notes || ''}`
  );
  
  return phoneFromNotes;
}

export function combineNotes(bookingData: any): string | null {
  const notes = [];
  
  if (bookingData.notes) notes.push(bookingData.notes);
  if (bookingData.comments) notes.push(bookingData.comments);
  if (bookingData.internalNotes) notes.push(bookingData.internalNotes);
  if (bookingData.channel || bookingData.referer) {
    notes.push(`Source: ${bookingData.channel || bookingData.referer}`);
  }
  
  return notes.length > 0 ? notes.join(' | ') : null;
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

### ✅ Completado
- [x] **Webhook endpoint configurado** y operativo
- [x] **Queue system operativo** con BullMQ + Redis
- [x] **Worker processing implementado** con sistema híbrido
- [x] **API client robusto** con rate limiting y retry logic
- [x] **Extracción de datos mejorada** con múltiples fallbacks
- [x] **Error handling robusto** con dead letter queue
- [x] **Logging estructurado** con información detallada
- [x] **Métricas básicas** implementadas
- [x] **Funciones de utilidad** para limpieza y validación
- [x] **Mapeo de datos completo** documentado
- [x] **Database upsert** con datos completos

### 🔄 En Testing
- [ ] **Testing de funciones de extracción** con datos reales
- [ ] **Validación de diferentes tipos** de reservas
- [ ] **Performance testing** con volumen alto

### 📋 Pendientes
- [ ] **HMAC verification** para seguridad
- [ ] **Rate limiting** por IP/source
- [ ] **Comprehensive testing** suite
- [ ] **Production monitoring alerts**
- [ ] **Property mapping** específico del negocio
- [ ] **Dashboard de métricas** avanzado