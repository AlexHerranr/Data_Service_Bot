# Guía de Troubleshooting - Webhooks Beds24

## Problemas Comunes y Soluciones

### 1. Error 400: Bad Request

#### Síntomas
```
HTTP 400 - Missing required fields: booking.id
```

#### Causas Posibles
- Payload incorrecto de Beds24
- Versión de webhook incorrecta
- Configuración malformada

#### Diagnóstico
```bash
# Verificar logs del webhook
curl https://dataservicebot-production.up.railway.app/api/admin/queues/stats

# Revisar Railway logs
# Filtrar por "beds24" o "webhook"
```

#### Soluciones
1. **Verificar configuración en Beds24**:
   - Webhook Version: `2 - with personal data`
   - URL correcta y accesible

2. **Validar payload structure**:
   ```typescript
   // El webhook debe contener:
   {
     "booking": {
       "id": number,  // REQUERIDO
       "status": string
     },
     "timeStamp": string
   }
   ```

3. **Test manual**:
   ```bash
   curl -X POST https://dataservicebot-production.up.railway.app/api/webhooks/beds24 \
     -H "Content-Type: application/json" \
     -d '{"booking": {"id": 123, "status": "test"}}'
   ```

### 2. Jobs en Estado "Failed"

#### Síntomas
```json
{
  "queues": {
    "beds24-sync": {
      "failed": 5
    }
  }
}
```

#### Diagnóstico
```bash
# Ver stats detalladas
curl https://dataservicebot-production.up.railway.app/api/admin/queues/stats

# Revisar Dead Letter Queue
curl https://dataservicebot-production.up.railway.app/api/admin/queues/health
```

#### Causas y Soluciones

**A. Error de API Beds24**
```
Error: Request failed with status code 401
```
**Solución**: Verificar `BEDS24_TOKEN` en variables

**B. Error de base de datos**
```
Error: Connection terminated unexpectedly
```
**Solución**: Verificar `DATABASE_URL` y conexión PostgreSQL

**C. Timeout en Redis**
```
Error: Command timed out
```
**Solución**: Ya implementado - filtered en logs como benign

#### Retry de Jobs Fallidos
```bash
# Reintentar jobs fallidos
curl -X POST https://dataservicebot-production.up.railway.app/api/admin/queues/retry-failed
```

### 3. Webhooks Duplicados

#### Síntomas
- Múltiples jobs para el mismo `bookingId`
- Logs repetidos para la misma reserva

#### Causas
- Beds24 envía múltiples webhooks para la misma acción
- Reintentos automáticos por timeouts

#### Solución Implementada
```typescript
// En syncSingleBooking() usamos UPSERT
await prisma.reservas.upsert({
  where: { bookingId },
  update: transformedData,
  create: transformedData,
});
```

#### Verificación
```sql
-- Verificar duplicados en BD
SELECT bookingId, COUNT(*) 
FROM "Booking" 
GROUP BY bookingId 
HAVING COUNT(*) > 1;
```

### 4. Datos Incompletos en BD

#### Síntomas
- Campos `null` o `undefined` en registros
- Información faltante del huésped

#### Diagnóstico
```bash
# Verificar raw data almacenada
curl https://dataservicebot-production.up.railway.app/api/admin/queues/jobs/{jobId}
```

#### Causas
- API de Beds24 retorna datos parciales
- Mapeo incorrecto de campos

#### Solución
1. **Verificar API response**:
   ```typescript
   // En sync.ts, loggear data completa
   logger.debug({ beds24Data }, 'Raw Beds24 API response');
   ```

2. **Mejorar mapeo de campos**:
   ```typescript
   function transformBookingData(beds24Data: any) {
     return {
       // Usar fallbacks para campos críticos
       guestName: beds24Data.guestName || 
                  beds24Data.reference || 
                  beds24Data.invoiceItems?.[0]?.invoiceeId || 
                  'Unknown Guest',
       
       phone: extractPhoneFromReference(beds24Data.apiReference) ||
              beds24Data.phone ||
              null,
       
       // Siempre guardar raw data para debugging
       raw: beds24Data,
     };
   }
   ```

### 5. Performance Issues

#### Síntomas
- Jobs lentos (>5 segundos)
- Timeouts frecuentes
- Queue backup

#### Diagnóstico
```bash
# Monitorear métricas
curl https://dataservicebot-production.up.railway.app/metrics | grep beds24

# Ver duración de jobs
# En Railway logs buscar: "duration": 
```

#### Optimizaciones

**A. Reducir Concurrencia**
```typescript
// En queue.manager.ts
const beds24Worker = new Worker('beds24-sync', processor, {
  concurrency: 1,  // Reducir si hay contention
  limiter: {
    max: 3,
    duration: 1000,
  },
});
```

**B. Optimizar API Calls**
```typescript
// Implementar timeout más agresivo
const beds24Client = axios.create({
  baseURL: env.BEDS24_API_URL,
  timeout: 5000,  // 5 segundos máximo
  headers: {
    'Authorization': `Bearer ${env.BEDS24_TOKEN}`,
  },
});
```

**C. Database Optimization**
```typescript
// Usar transacciones para múltiples operaciones
await prisma.$transaction(async (tx) => {
  await tx.reservas.upsert({ ... });
  await tx.prospectos.upsert({ ... });
});
```

### 6. Connectivity Issues

#### Síntomas
```
ENOTFOUND dataservicebot-production.up.railway.app
Connection refused
```

#### Verificaciones
1. **Health Check**:
   ```bash
   curl https://dataservicebot-production.up.railway.app/api/health
   ```

2. **Service Status**:
   - Railway Dashboard → Data_Service_Bot → Status

3. **DNS Resolution**:
   ```bash
   nslookup dataservicebot-production.up.railway.app
   ```

#### Soluciones
- Verificar que el servicio esté "Active" en Railway
- Regenerar dominio si es necesario
- Verificar que puerto 8080 esté expuesto internamente

### 7. Security Issues

#### Síntomas
- Webhooks de IPs desconocidas
- Payloads malformados o sospechosos

#### Implementar Verificación HMAC
```typescript
// TODO: Implementar en producción
function verifyHmac(req: Request, res: Response, next: Function) {
  const signature = req.headers['authorization'];
  
  if (!signature || !signature.startsWith('Bearer beds24-webhook-secret')) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  next();
}
```

#### Rate Limiting
```typescript
// Implementar rate limiting por IP
const rateLimit = require('express-rate-limit');

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // máximo 100 requests por IP por minuto
  message: 'Too many webhook requests',
});

router.post('/webhooks/beds24', webhookLimiter, verifyHmac, ...);
```

## Monitoreo Proactivo

### Alertas Recomendadas

1. **Failed Jobs > 5**:
   ```bash
   # Query metrics
   beds24_jobs_failed_total > 5
   ```

2. **Webhook Response Time > 1s**:
   ```bash
   # Query metrics  
   avg(http_request_duration_seconds{path="/api/webhooks/beds24"}) > 1
   ```

3. **Queue Backup**:
   ```bash
   # Query stats
   beds24_queue_waiting_total > 50
   ```

### Dashboard Métricas

#### Grafana Queries
```promql
# Webhook rate
rate(http_requests_total{path="/api/webhooks/beds24"}[5m])

# Job success rate
rate(beds24_jobs_completed_total{status="success"}[5m]) / 
rate(beds24_jobs_total[5m])

# Average processing time
avg(beds24_job_duration_seconds) by (type)
```

### Logs Structured Search

#### Railway Logs Filters
```
# Successful webhooks
level:info AND "Beds24 webhook received"

# Failed jobs
level:error AND "Job failed"

# Performance issues
"duration" AND "> 3000"

# Queue stats
"queue" AND "stats"
```

## Herramientas de Debugging

### Scripts de Testing

#### Test Completo del Flujo
```bash
#!/bin/bash
# test-beds24-webhook.sh

echo "=== Testing Beds24 Webhook Flow ==="

# 1. Health check
echo "1. Health check..."
curl -s https://dataservicebot-production.up.railway.app/api/health | jq

# 2. Send test webhook
echo "2. Sending test webhook..."
curl -X POST https://dataservicebot-production.up.railway.app/api/webhooks/beds24 \
  -H "Content-Type: application/json" \
  -d '{
    "timeStamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'",
    "booking": {
      "id": 999999,
      "status": "test",
      "bookingTime": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'",
      "modifiedTime": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
    }
  }'

echo ""

# 3. Wait and check stats
echo "3. Waiting 5 seconds for processing..."
sleep 5

echo "4. Checking queue stats..."
curl -s https://dataservicebot-production.up.railway.app/api/admin/queues/stats | jq

echo "=== Test completed ==="
```

#### Database Query Helper
```sql
-- Verificar últimas reservas procesadas
SELECT 
  bookingId,
  status,
  guestName,
  arrivalDate,
  lastUpdatedBD,
  raw->'booking'->>'channel' as channel
FROM "Booking" 
WHERE lastUpdatedBD > NOW() - INTERVAL '1 hour'
ORDER BY lastUpdatedBD DESC
LIMIT 10;
```

### Monitoring Commands

#### Quick Status Check
```bash
# One-liner para verificar estado general
curl -s https://dataservicebot-production.up.railway.app/api/health | jq '.services' && \
curl -s https://dataservicebot-production.up.railway.app/api/admin/queues/stats | jq '.queues'
```

---

## Escalation Procedures

### Nivel 1: Self-Service
- Verificar health endpoints
- Revisar logs recientes
- Retry failed jobs

### Nivel 2: Código/Configuración
- Verificar variables de entorno
- Revisar configuración de Beds24
- Analizar logs estructurados

### Nivel 3: Infraestructura
- Verificar Railway service status
- Revisar conectividad Redis/PostgreSQL
- Contactar soporte Railway si es necesario

### Emergency Contacts
- **Railway Support**: support@railway.app
- **Beds24 API Support**: Documentación oficial
- **Internal Team**: [Tu team de desarrollo]