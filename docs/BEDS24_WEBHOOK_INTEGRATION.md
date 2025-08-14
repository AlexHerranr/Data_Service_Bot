# 🏨 Integración Completa de Webhooks Beds24

## 📋 Resumen
Documentación completa de la integración con webhooks de Beds24, incluyendo configuración, implementación técnica, procesamiento híbrido y troubleshooting.

## 📚 Tabla de Contenidos
- [🔧 Configuración en Beds24](#configuración-en-beds24)
- [🏗️ Arquitectura del Sistema](#arquitectura-del-sistema)
- [📄 Formato del Payload](#formato-del-payload)
- [⚙️ Implementación Técnica](#implementación-técnica)
- [🔄 Flujo de Sincronización](#flujo-de-sincronización)
- [📊 Monitoreo y Debugging](#monitoreo-y-debugging)
- [🚨 Troubleshooting](#troubleshooting)
- [✅ Estado de Implementación](#estado-de-implementación)

## Configuración en Beds24

### Ubicación de Configuración
1. **Panel Beds24**: Settings → Properties → Access → Booking Webhook
2. **Configuración recomendada**:
   - **Webhook Version**: `2 - with personal data`
   - **URL**: `https://dataservicebot-production.up.railway.app/api/webhooks/beds24`
   - **Custom Header**: `Authorization: Bearer beds24-webhook-secret-123`
   - **Additional Data**: `No Cards`

### Eventos Soportados
- ✅ **Created**: Nueva reserva creada
- ✅ **Modified**: Reserva modificada  
- ✅ **Cancelled**: Reserva cancelada
- ✅ **All Status**: Acepta cualquier status de Beds24

## Arquitectura del Sistema

### Flujo General
```
Beds24 → Webhook Endpoint → Queue Job → API Sync → Database Update
```

### Componentes Principales

1. **Webhook Receiver**: `/api/webhooks/beds24`
   - Recibe payload de Beds24
   - Valida estructura básica
   - Responde inmediatamente (200 OK)
   - Encola job asíncrono

2. **Queue System**: BullMQ + Redis
   - Procesa jobs de forma asíncrona
   - Maneja reintentos automáticos
   - Dead Letter Queue para fallos

3. **Sync Service**: `syncSingleBooking()`
   - Llama API completa de Beds24
   - Extrae datos relevantes
   - Actualiza base de datos

## Formato del Payload

### Estructura del Webhook Beds24
```json
{
  "timeStamp": "2025-08-14T21:29:52.926Z",
  "booking": {
    "id": 12345,
    "bookingGroup": {
      "master": 0,
      "ids": [12345]
    },
    "masterId": 0,
    "propertyId": 101,
    "roomId": 201,
    "status": "confirmed",
    "subStatus": "active",
    "arrival": "2025-08-15",
    "departure": "2025-08-17",
    "numAdult": 2,
    "numChild": 0,
    "price": 250.00,
    "deposit": 50.00,
    "tax": 25.00,
    "bookingTime": "2025-08-14T21:29:52.926Z",
    "modifiedTime": "2025-08-14T21:29:52.926Z",
    "cancelTime": null,
    "channel": "booking.com",
    "reference": "BK123456",
    "apiReference": "API789"
  },
  "invoiceItems": [],
  "infoItems": [],
  "messages": [],
  "retries": 0
}
```

### Mapeo de Datos Mejorado

#### Datos Básicos de Reserva
| Campo Beds24 | Campo BD | Transformación | Fallbacks |
|--------------|----------|----------------|-----------|
| `booking.id` | `bookingId` | String conversion | `bookingId` |
| `booking.status` | `status` | Direct mapping | - |
| `booking.arrival` | `arrivalDate` | Date string | - |
| `booking.departure` | `departureDate` | Date string | - |
| `booking.numAdult + numChild` | `totalPersons` | Sum calculation | `adults + children` |
| `booking.price` | `totalCharges` | String conversion | - |
| `booking.propertyId` | `propertyName` | Property lookup | Configurable mapping |

#### Información del Huésped (Mejorada)
| Campo Beds24 | Campo BD | Estrategias de Extracción |
|--------------|----------|---------------------------|
| Guest Name | `guestName` | 1. `guestFirstName + guestName`<br>2. `firstName + lastName`<br>3. `guestName`<br>4. `reference`<br>5. `Guest {invoiceeId}` |
| Phone | `phone` | 1. `phone` (cleaned)<br>2. `guestPhone`<br>3. Extract from `apiReference`<br>4. Regex from `comments/notes`<br>5. International format (+) |
| Email | `email` | 1. `email`<br>2. `guestEmail`<br>3. Regex from `comments/notes` |

#### Información Avanzada
| Campo | Fuente | Transformación |
|-------|--------|----------------|
| `internalNotes` | `combineNotes()` | Combina `notes + comments + internalNotes + channel` |
| `channel` | `determineChannel()` | Priority: `channel > referer > source > apiSource` |
| `messages` | `extractMessages()` | Array completo de mensajes con metadata |
| `charges` | `extractChargesAndPayments()` | Array detallado de cargos |
| `payments` | `extractChargesAndPayments()` | Array detallado de pagos |

## Procesamiento de Webhooks

### 1. Validación de Entrada
```typescript
// Validación básica
if (!booking || !booking.id) {
  return 400; // Missing required fields
}
```

### 2. Determinación de Acción
```typescript
let action = 'created';
if (booking.cancelTime) {
  action = 'cancelled';
} else if (booking.modifiedTime !== booking.bookingTime) {
  action = 'modified';
}

// Check status for cancellation indicators
if (status?.toLowerCase().includes('cancel')) {
  action = 'cancelled';
}
```

### 3. Encolado de Job
```typescript
const job = await addWebhookJob({
  bookingId: String(booking.id),
  action,
  timestamp: new Date(),
  priority: action === 'cancelled' ? 'high' : 'normal'
});
```

## ⚙️ Implementación Técnica

### Estructura de Archivos
```
data-sync/src/providers/beds24/
├── client.ts          # Cliente API con rate limiting
├── sync.ts            # Lógica de sincronización híbrida  
├── utils.ts           # Funciones de extracción de datos
└── types.ts           # Interfaces y tipos
```

### Cliente API (client.ts)
```typescript
export class Beds24Client {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;

  async getBooking(bookingId: string): Promise<any> {
    const response = await this.requestWithRetry({
      method: 'GET',
      url: `/bookings/${bookingId}`,
      params: {
        includeInvoice: true,
        includeInfoItems: true,
        includeComments: true,
      }
    });

    return response.data.data?.[0] || null;
  }
}
```

### Webhook Handler (beds24.route.ts)
```typescript
router.post('/webhooks/beds24', verifyHmac, async (req, res) => {
  const { booking, timeStamp } = req.body;
  
  if (!booking || !booking.id) {
    return res.status(400).json({ 
      error: 'Missing required fields: booking.id' 
    });
  }

  // Respuesta inmediata
  res.status(200).json({ 
    status: 'accepted',
    timestamp: new Date().toISOString()
  });

  // Determinar acción
  let action = 'created';
  if (booking.cancelTime) action = 'cancelled';
  else if (booking.modifiedTime !== booking.bookingTime) action = 'modified';

  // Encolar job asíncrono
  await addWebhookJob({
    bookingId: String(booking.id),
    action,
    timestamp: new Date(),
    priority: action === 'cancelled' ? 'high' : 'normal'
  });
});
```

### Sincronización Híbrida (sync.ts)
```typescript
// Función principal - recibe solo bookingId
export async function syncSingleBooking(bookingId: string) {
  const client = getBeds24Client();
  const bookingData = await client.getBooking(bookingId);
  
  if (!bookingData) {
    return { success: false, action: 'skipped' };
  }
  
  return await processSingleBookingData(bookingData);
}

// Procesamiento con extracción mejorada
export async function processSingleBookingData(bookingData: any) {
  const enhancedData = {
    bookingId: (bookingData.bookingId || bookingData.id)?.toString(),
    guestName: extractGuestName(bookingData),
    phone: extractPhoneNumber(bookingData),
    email: extractEmail(bookingData),
    channel: determineChannel(bookingData),
    internalNotes: combineNotes(bookingData),
    messages: extractMessages(bookingData),
    // ... más campos
    raw: bookingData // Payload completo
  };

  await prisma.reservas.upsert({
    where: { bookingId: enhancedData.bookingId },
    create: enhancedData,
    update: enhancedData
  });
}
```

### Funciones de Extracción (utils.ts)
```typescript
export function extractGuestName(bookingData: any): string | null {
  // 1. Nombre completo
  if (bookingData.guestFirstName && bookingData.guestName) {
    return `${bookingData.guestFirstName} ${bookingData.guestName}`;
  }
  
  // 2. firstName + lastName
  if (bookingData.firstName && bookingData.lastName) {
    return `${bookingData.firstName} ${bookingData.lastName}`;
  }
  
  // 3. Solo guestName
  if (bookingData.guestName) return bookingData.guestName;
  
  // 4. Fallback a reference
  return bookingData.reference || null;
}

export function extractPhoneNumber(bookingData: any): string | null {
  // 1. Campo directo
  if (bookingData.phone) {
    return cleanPhoneNumber(bookingData.phone);
  }
  
  // 2. Extraer de apiReference (WhatsApp)
  if (bookingData.apiReference) {
    const phoneMatch = bookingData.apiReference.match(/(\+?\d{10,15})/);
    if (phoneMatch) return cleanPhoneNumber(phoneMatch[1]);
  }
  
  // 3. Regex desde comentarios
  const text = `${bookingData.comments || ''} ${bookingData.notes || ''}`;
  const phoneMatch = text.match(/(\+?\d{1,4}[\s-]?\d{10,15})/);
  return phoneMatch ? cleanPhoneNumber(phoneMatch[1]) : null;
}

export function combineNotes(bookingData: any): string | null {
  const notes = [];
  
  if (bookingData.notes) notes.push(bookingData.notes);
  if (bookingData.comments) notes.push(bookingData.comments);
  if (bookingData.channel) notes.push(`Source: ${bookingData.channel}`);
  
  return notes.length > 0 ? notes.join(' | ') : null;
}
```

### Worker Processing (queue.manager.ts)
```typescript
export const beds24Worker = new Worker<JobData>(
  'beds24-sync',
  async (job: Job<JobData>) => {
    if (data.type === 'webhook') {
      const webhookData = data as WebhookJob;
      
      // Llamada híbrida - fetch data completa
      await syncSingleBooking(webhookData.bookingId);
      
      logger.info({ 
        jobId: job.id,
        bookingId: webhookData.bookingId,
        action: webhookData.action
      }, 'Webhook job completed');
    }
  },
  {
    connection: redis,
    concurrency: 2,
    limiter: { max: 5, duration: 1000 }
  }
);
```

## 🔄 Flujo de Sincronización

### Estrategia Híbrida Implementada
**Webhook como Trigger → API Call Completa → Extracción Mejorada**

#### Ventajas:
- ✅ Datos completos y consistentes de la API
- ✅ Múltiples fallbacks para campos críticos
- ✅ Resiliente a cambios en formato de webhook
- ✅ Performance optimizada (response inmediato)
- ✅ Extracción inteligente de información del huésped

#### Pasos del Proceso Detallado:

1. **Webhook Trigger**:
   ```typescript
   // Webhook recibe payload básico
   const { booking } = req.body;
   const bookingId = String(booking.id);
   const action = determineAction(booking);
   
   // Respuesta inmediata (200 OK)
   res.json({ status: 'accepted' });
   
   // Encola job asíncrono
   await addWebhookJob({ bookingId, action });
   ```

2. **API Call Completa**:
   ```typescript
   // Worker ejecuta llamada completa a API
   export async function syncSingleBooking(bookingId: string) {
     const client = getBeds24Client();
     const bookingData = await client.getBooking(bookingId);
     
     if (!bookingData) {
       logger.warn({ bookingId }, 'Booking not found');
       return { success: false, action: 'skipped' };
     }
     
     return await processSingleBookingData(bookingData);
   }
   ```

3. **Extracción Mejorada**:
   ```typescript
   // Extracción inteligente con múltiples fallbacks
   const guestName = extractGuestName(bookingData);
   const phone = extractPhoneNumber(bookingData);
   const email = extractEmail(bookingData);
   const channel = determineChannel(bookingData);
   const messages = extractMessages(bookingData);
   
   const enhancedData = {
     bookingId,
     guestName,
     phone,
     email,
     channel,
     messages,
     internalNotes: combineNotes(bookingData),
     // ... más campos
     raw: bookingData // Payload completo para debugging
   };
   ```

4. **Database Update**:
   ```typescript
   // Upsert con datos completos
   await prisma.reservas.upsert({
     where: { bookingId },
     create: enhancedData,
     update: enhancedData
   });
   ```

5. **Logging y Metrics**:
   ```typescript
   logger.info({ 
     bookingId, 
     action,
     guestName,
     phone,
     channel,
     duration: Date.now() - startTime
   }, 'Booking synced with enhanced data');
   
   metricsHelpers.recordJobComplete('webhook', startTime, 'success');
   ```

### Funciones de Extracción Implementadas

#### `extractGuestName()`
```typescript
// Múltiples estrategias de extracción
1. guestFirstName + guestName
2. firstName + lastName  
3. Solo guestName
4. reference (fallback)
5. "Guest {invoiceeId}" (último recurso)
```

#### `extractPhoneNumber()`
```typescript
// Limpieza y formato internacional
1. phone field directo
2. guestPhone field
3. Regex desde apiReference (ej: whatsapp_+1234567890)
4. Regex desde comments/notes
5. Formato internacional con +
```

#### `extractEmail()`
```typescript
// Extracción con validación
1. email field directo
2. guestEmail field
3. Regex pattern desde texto libre
```

#### `combineNotes()`
```typescript
// Consolida toda la información
- notes + comments + internalNotes
- Información de canal/source
- Separador: " | "
```

## Monitoreo y Debugging

### Endpoints de Monitoreo

1. **Health Check**:
   ```bash
   GET /api/health
   ```
   
2. **Queue Stats**:
   ```bash
   GET /api/admin/queues/stats
   ```

3. **Prometheus Metrics**:
   ```bash
   GET /metrics
   ```

### Logs Importantes

#### Webhook Recibido
```json
{
  "type": "beds24:webhook",
  "bookingId": "12345",
  "action": "modified",
  "status": "confirmed",
  "propertyId": 101,
  "arrival": "2025-08-15",
  "departure": "2025-08-17"
}
```

#### Job Procesado
```json
{
  "jobId": "job_123",
  "bookingId": "12345",
  "action": "modified",
  "duration": 250
}
```

### Debugging Común

#### Error 400: Bad Request
- **Causa**: Formato incorrecto del payload
- **Solución**: Verificar estructura `booking.id`

#### Jobs en Failed
- **Causa**: Error en API call o BD
- **Solución**: Revisar logs detallados del worker

#### Timeouts
- **Causa**: API lenta o Redis sobrecargado
- **Solución**: Ajustar timeouts o reducir concurrencia

## Configuración Avanzada

### Variables de Entorno
```env
BEDS24_TOKEN=tu-token-api
BEDS24_API_URL=https://api.beds24.com/v2
REDIS_URL=redis://...
DATABASE_URL=postgresql://...
```

### Configuración de Queue
```typescript
const QUEUE_CONFIG = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  }
};
```

### Worker Settings
```typescript
const beds24Worker = new Worker('beds24-sync', processor, {
  connection: redis,
  concurrency: 2,  // Ajustable según carga
  limiter: {
    max: 5,
    duration: 1000,  // 5 jobs/segundo
  },
});
```

### Security Headers
```typescript
// En producción, implementar verificación HMAC
function verifyHmac(req, res, next) {
  const signature = req.headers['authorization'];
  // Verificar firma contra secreto compartido
  next();
}
```

## Testing

### Test Manual
```bash
# Test webhook endpoint
curl -X POST https://dataservicebot-production.up.railway.app/api/webhooks/beds24 \
  -H "Content-Type: application/json" \
  -d '{
    "timeStamp": "2025-08-14T21:29:52.926Z",
    "booking": {
      "id": 12345,
      "status": "confirmed",
      "action": "modified"
    }
  }'
```

### Verificación de Stats
```bash
# Verificar procesamiento
curl https://dataservicebot-production.up.railway.app/api/admin/queues/stats
```

### Logs en Railway
1. Ve a Railway Dashboard → Data_Service_Bot → Logs
2. Filtra por "beds24" o "webhook"
3. Monitorea jobs procesados exitosamente

## 🚨 Troubleshooting

### Problemas Comunes

#### Error 400: Bad Request
**Síntoma**: `Missing required fields: booking.id`
**Causa**: Payload de webhook incorrecto
**Solución**: 
```bash
# Verificar configuración Beds24
Version: 2 - with personal data
URL: https://dataservicebot-production.up.railway.app/api/webhooks/beds24
```

#### Jobs en Failed State
**Síntoma**: Queue stats muestran `failed > 0`
**Diagnóstico**:
```bash
curl https://dataservicebot-production.up.railway.app/api/admin/queues/stats
```
**Soluciones**:
- Verificar BEDS24_TOKEN en variables
- Verificar conectividad a PostgreSQL
- Retry failed jobs: `POST /api/admin/queues/retry-failed`

#### Datos Incompletos en BD
**Síntoma**: Campos null o información faltante del huésped
**Causa**: API de Beds24 retorna datos parciales
**Solución**: Las funciones de extracción tienen múltiples fallbacks implementados

#### Performance Issues
**Síntoma**: Jobs lentos (>5 segundos)
**Optimizaciones**:
- Reducir concurrencia: `concurrency: 1`
- Ajustar rate limiting: `max: 3, duration: 1000`

### Herramientas de Debug

#### Test Webhook
```bash
curl -X POST https://dataservicebot-production.up.railway.app/api/webhooks/beds24 \
  -H "Content-Type: application/json" \
  -d '{
    "timeStamp": "2025-08-14T21:29:52.926Z",
    "booking": {
      "id": 12345,
      "status": "confirmed",
      "bookingTime": "2025-08-14T21:29:52.926Z"
    }
  }'
```

#### Verificar Stats
```bash
# Estado general
curl https://dataservicebot-production.up.railway.app/api/health

# Queue stats
curl https://dataservicebot-production.up.railway.app/api/admin/queues/stats
```

#### Logs Estructurados
```bash
# En Railway logs, buscar:
"Beds24 webhook received"     # Webhook processing
"Booking synced successfully" # Successful sync
"Failed to sync"              # Errors
```

---

## Estado de Implementación

### ✅ Completado
- [x] **Webhook endpoint configurado y operativo**
- [x] **Sistema híbrido implementado** (webhook trigger + API call)
- [x] **Extracción mejorada de datos del huésped** con múltiples fallbacks
- [x] **Funciones de utilidad robustas** para limpieza y validación
- [x] **Mapeo completo de campos** documentado
- [x] **Logging estructurado** con información detallada
- [x] **Error handling robusto** con reintentos automáticos
- [x] **Métricas básicas** implementadas

### 🔄 En Progreso
- [ ] **Testing comprehensivo** de todas las funciones de extracción
- [ ] **Validación con datos reales** de diferentes tipos de reservas

### 📋 Próximos Pasos
- [ ] **Implementar verificación HMAC** para seguridad
- [ ] **Agregar métricas específicas** por propertyId y channel
- [ ] **Configurar mapeo de propiedades** específico del negocio
- [ ] **Implementar alertas** para fallos críticos
- [ ] **Dashboard de monitoreo** avanzado
- [ ] **Testing de carga** para webhooks de alto volumen

### 🎯 Funcionalidades Avanzadas
- [ ] **Rate limiting** inteligente por IP/source
- [ ] **Cache de datos** frecuentemente accedidos
- [ ] **Webhook signing** verification
- [ ] **Dead letter queue** monitoring con alertas
- [ ] **Bulk data sync** optimization