# 🔄 Flujo: Actualización de Bookings

## 📋 **Descripción**

Flujo automático que mantiene la tabla `Booking` sincronizada en tiempo real con cambios en reservas de Beds24 mediante webhooks, jobs asíncronos y API calls.

## 🎯 **Propósito**

- **Sincronización en tiempo real**: Booking table siempre actualizada
- **Procesamiento asíncrono**: Webhooks no bloquean respuesta a Beds24
- **Manejo completo**: CREATED, MODIFIED, CANCELLED automáticamente
- **Datos completos**: Incluye mensajes, charges, payments, info items

## 🔄 **Flujo Técnico Completo**

### **Diagrama de Flujo**
```
🏨 Beds24 Event (Created/Modified/Cancelled)
    ↓ HTTP POST
📥 /api/webhooks/beds24 (Webhook Receiver)
    ↓ Validate + Enqueue
🔄 BullMQ Queue (beds24-sync)
    ↓ Async Processing
⚙️ syncSingleBooking(bookingId)
    ↓ API Call
🏨 Beds24 API /bookings/{id} (Complete Data)
    ↓ Transform + Map
💾 PostgreSQL UPSERT Booking Table
    ↓ Success
📊 Metrics + Logs
```

## 📡 **Endpoints Involucrados**

### **1. Webhook Receiver**
```http
POST /api/webhooks/beds24
Content-Type: application/json
Authorization: Bearer beds24-webhook-secret (opcional)
```

**Payload Structure:**
```json
{
  "timeStamp": "2025-08-15T14:38:32.654Z",
  "booking": {
    "id": 12345,
    "status": "confirmed",
    "arrival": "2025-08-20",
    "departure": "2025-08-22",
    "price": 150
  },
  "messages": [...],
  "invoiceItems": [...],
  "infoItems": [...],
  "retries": 0
}
```

**Response:**
```json
{
  "received": true,
  "timestamp": "2025-08-15T14:38:32.654Z"
}
```

### **2. Beds24 API Call (Internal)**
```http
GET https://api.beds24.com/v2/bookings/{bookingId}
Headers: token: {BEDS24_TOKEN}
```

**Obtiene datos completos** de la reserva para sincronización.

## ⚙️ **Procesamiento por Componentes**

### **1. 📥 Webhook Handler**
**Archivo**: `src/server/routes/webhooks/beds24.route.ts`

```typescript
// Mapeo de acciones
const action = payload.action || 'MODIFY';
if (action === 'created') action = 'CREATED';
if (action === 'modified') action = 'MODIFY'; 
if (action === 'cancelled') action = 'CANCEL';

// Validación básica
const bookingId = payload.id || payload.booking?.id || payload.bookingId;
if (!bookingId) {
  logger.warn('Missing booking ID, skipping');
  return;
}

// Encolar job asíncrono
await addWebhookJob({
  bookingId: bookingId,
  action: action,
  payload: payload
});
```

### **2. 🔄 Queue Worker**
**Archivo**: `src/infra/queues/queue.manager.ts`

```typescript
// Procesa 3 tipos de acciones
if (action === 'CREATED' || action === 'MODIFY' || action === 'CANCEL') {
  await syncSingleBooking(bookingId);
}
```

**Configuración Queue:**
- **Attempts**: 3 reintentos automáticos
- **Backoff**: Exponential delay (5s, 25s, 125s)
- **Remove**: 100 completed, 50 failed jobs

### **3. 📡 Sync Service**
**Archivo**: `src/providers/beds24/sync.ts`

```typescript
export async function syncSingleBooking(bookingId: string) {
  // 1. Fetch complete data from Beds24 API
  const bookingData = await client.getBooking(bookingId);
  
  // 2. Transform and extract data
  const commonData = {
    bookingId,
    phone: extractPhoneNumber(bookingData),
    guestName: extractGuestName(bookingData),
    status: bookingData.status,
    messages: extractMessages(bookingData), // ← Mensajes incluidos
    charges: extractChargesAndPayments(bookingData).charges,
    // ... todos los demás campos
  };
  
  // 3. UPSERT in database
  const result = await prisma.booking.upsert({
    where: { bookingId },
    create: commonData,
    update: commonData
  });
  
  return { success: true, action: existing ? 'updated' : 'created' };
}
```

## 💾 **Operaciones de Base de Datos**

### **Tabla Objetivo: `Booking`**
**Constraint**: `bookingId UNIQUE` (clave de matching)

**Estrategia**: **UPSERT completo**
- **CREATE**: Si `bookingId` no existe → INSERT nueva fila
- **UPDATE**: Si `bookingId` existe → UPDATE todos los campos

### **Campos Actualizados:**
```sql
-- Información básica
bookingId, phone, guestName, status, propertyName
arrivalDate, departureDate, numNights, totalPersons

-- Datos financieros  
totalCharges, totalPayments, balance, basePrice

-- Metadata
channel, email, apiReference, notes, modifiedDate
lastUpdatedBD, BDStatus

-- Datos JSON
charges, payments, messages, infoItems, raw
```

## 📊 **Monitoreo y Observabilidad**

### **Métricas Prometheus**
- `beds24_webhooks_received_total{action="CREATED|MODIFY|CANCEL"}`
- `jobs_processed_total{type="webhook"}`
- `jobs_failed_total{type="webhook"}`
- `beds24_api_calls_total{endpoint="bookings"}`

### **Logs Estructurados**
```json
{
  "level": "info",
  "msg": "Beds24 webhook received",
  "bookingId": "12345",
  "action": "MODIFY",
  "timestamp": "2025-08-15T14:38:32.654Z"
}
```

### **Health Checks**
```bash
# Verificar estado del sistema
GET /api/health

# Monitorear queues
GET /api/admin/queues/stats

# Dashboard visual
GET /api/admin/queues/ui
```

## 🧪 **Testing del Flujo**

### **1. Test Webhook Manual**
```bash
curl -X POST http://localhost:3001/api/webhooks/beds24 \
  -H "Content-Type: application/json" \
  -d '{
    "booking": {
      "id": "TEST123",
      "status": "confirmed",
      "arrival": "2025-08-20"
    },
    "messages": []
  }'
```

### **2. Monitorear Procesamiento**
```bash
# Ver logs en tiempo real
npm run dev

# Monitor continuo
npm run monitor:continuous

# Verificar queue
curl http://localhost:3001/api/admin/queues/stats
```

### **3. Verificar BD**
```bash
# Abrir Prisma Studio
npm run db:studio

# Query directo
SELECT * FROM "Booking" WHERE "bookingId" = 'TEST123';
```

## 🔧 **Configuración Requerida**

### **Variables de Entorno**
```bash
# Database
DATABASE_URL="postgresql://..."

# Redis para queues
REDIS_URL="redis://..."

# Beds24 API
BEDS24_TOKEN="read_token"
BEDS24_WRITE_REFRESH_TOKEN="refresh_token" 
BEDS24_API_URL="https://api.beds24.com/v2"

# Webhook security (opcional)
BEDS24_WEBHOOK_TOKEN="webhook_secret"
```

### **Configuración Beds24**
**Panel**: Settings → Properties → Access → Booking Webhook

- **URL**: `https://your-domain.com/api/webhooks/beds24`
- **Version**: `2 - with personal data`
- **Events**: Created, Modified, Cancelled
- **Custom Header**: `Authorization: Bearer your_webhook_token`

## 🚨 **Troubleshooting**

### **❌ "Webhook no llega"**
```bash
# Verificar URL en Beds24
# Test endpoint manualmente
curl -X POST https://your-domain.com/api/webhooks/beds24

# Verificar logs
tail -f logs/app.log | grep webhook
```

### **❌ "Job falla constantemente"**
```bash
# Ver failed jobs
curl http://localhost:3001/api/admin/queues/ui

# Check Beds24 API connection
curl -H "token: $BEDS24_TOKEN" https://api.beds24.com/v2/bookings/12345
```

### **❌ "BD no se actualiza"**
```bash
# Verificar constraint unique
SELECT COUNT(*) FROM "Booking" WHERE "bookingId" = '12345';

# Check sync result
SELECT "lastUpdatedBD", "modifiedDate" FROM "Booking" 
WHERE "bookingId" = '12345';
```

### **❌ "Memoria alta / Queue bloqueada"**
```bash
# Limpiar completed jobs
redis-cli DEL bull:beds24-sync:completed

# Restart workers
pm2 restart data-sync

# Monitor resources
npm run monitor
```

## 📈 **Performance y Escalabilidad**

### **Optimizaciones Implementadas**
- **Response inmediato**: Webhook responde 202 antes de procesar
- **Async processing**: Jobs no bloquean main thread
- **Rate limiting**: Beds24 API calls respetan límites
- **Dead letter queue**: Jobs fallidos no se pierden
- **Batch cleanup**: Jobs antiguos se eliminan automáticamente

### **Límites Actuales**
- **Webhook timeout**: 30 segundos máximo
- **Job attempts**: 3 reintentos con backoff exponencial
- **Queue memory**: 100 completed + 50 failed jobs en memoria
- **API rate**: Beds24 limits (auto-handled)

## 🔄 **Flujos Relacionados**

### **Próximos Flujos a Implementar**
- **Sync Masivo**: Backfill histórico de reservas
- **Message Notifications**: Envío WhatsApp cuando llegan mensajes
- **Inventory Updates**: Sincronización disponibilidad rooms
- **Payment Webhooks**: Procesamiento payments/charges separado

---

## 📋 **Resumen Ejecutivo**

**Flujo Actualización Bookings** mantiene sincronización automática en tiempo real entre Beds24 y nuestra BD mediante:

1. **Webhooks inmediatos** de Beds24 (CREATED/MODIFIED/CANCELLED)
2. **Jobs asíncronos** para no bloquear respuesta
3. **API calls completas** para obtener data actualizada
4. **UPSERT por bookingId** único garantiza consistencia
5. **Monitoreo completo** con métricas y logs

**Estado**: ✅ **Implementado y funcional**  
**Testing**: ✅ **Validado con unit tests**  
**Deploy**: 🟡 **Listo para staging**