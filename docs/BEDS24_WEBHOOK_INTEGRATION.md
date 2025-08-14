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

### Mapeo de Datos
| Campo Beds24 | Campo BD | Transformación |
|--------------|----------|----------------|
| `booking.id` | `bookingId` | String conversion |
| `booking.status` | `status` | Direct mapping |
| `booking.arrival` | `arrivalDate` | Date string |
| `booking.departure` | `departureDate` | Date string |
| `booking.numAdult + numChild` | `totalPersons` | Sum calculation |
| `booking.price` | `totalCharges` | String conversion |
| `booking.propertyId` | `propertyName` | Property lookup |
| `booking.channel` | `channel` | Direct mapping |

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

### Estrategia Híbrida
**Webhook como Trigger → API Call Completa**

#### Ventajas:
- ✅ Datos completos y consistentes
- ✅ Resiliente a fallos
- ✅ Performance optimizada
- ✅ Fácil debugging

#### Pasos del Proceso:
1. **Webhook recibido**: Extrae `bookingId` básico
2. **Job encolado**: Con prioridad según tipo
3. **API call**: `GET /v2/booking/{id}` para datos completos
4. **Database update**: Actualiza/crea registro en BD
5. **Metrics**: Registra métricas de proceso

### Código de Sincronización
```typescript
// En queue.manager.ts - Worker processor
if (data.type === 'webhook') {
  const webhookData = data as WebhookJob;
  await syncSingleBooking(webhookData.bookingId);
  
  logger.info({ 
    bookingId: webhookData.bookingId,
    action: webhookData.action
  }, 'Webhook job completed');
}
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

## Próximos Pasos

- [ ] Implementar verificación HMAC para seguridad
- [ ] Agregar métricas específicas por propertyId
- [ ] Optimizar extracción de datos del huésped
- [ ] Implementar alertas para fallos críticos
- [ ] Documentar mapeo completo de campos