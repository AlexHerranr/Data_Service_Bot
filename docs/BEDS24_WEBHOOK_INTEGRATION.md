# Integración de Webhooks Beds24

## Resumen
Este documento describe la implementación completa de la integración con webhooks de Beds24, incluyendo configuración, procesamiento y sincronización de datos.

## Tabla de Contenidos
- [Configuración en Beds24](#configuración-en-beds24)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Formato del Payload](#formato-del-payload)
- [Procesamiento de Webhooks](#procesamiento-de-webhooks)
- [Flujo de Sincronización](#flujo-de-sincronización)
- [Monitoreo y Debugging](#monitoreo-y-debugging)
- [Configuración Avanzada](#configuración-avanzada)

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

## Flujo de Sincronización

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