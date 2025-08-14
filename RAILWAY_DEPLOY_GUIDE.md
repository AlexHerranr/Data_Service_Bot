# 🚀 RAILWAY DEPLOYMENT GUIDE - BOT DATA SERVICE

## 📋 **PRE-DEPLOY CHECKLIST**

### 1. **🔐 ROTAR CREDENCIAL POSTGRESQL (CRÍTICO)**
- Ve a Railway Dashboard → Tu proyecto → Variables
- Busca `DATABASE_URL` → Click "Regenerate"
- Copia la nueva URL para uso en ambos servicios

### 2. **🆕 CREAR NUEVO SERVICIO EN RAILWAY**
- Railway Dashboard → "New Service"
- Connect Repository → Buscar tu repo GitHub
- Seleccionar branch: `master`

### 3. **⚙️ CONFIGURAR VARIABLES DE ENTORNO**

Agrega estas variables en Railway UI:

```env
# 🗄️ BASE DE DATOS (USAR LA NUEVA URL ROTADA)
DATABASE_URL="postgresql://nueva-url-rotada-aqui"

# 🏨 BEDS24 API
BEDS24_TOKEN="gLNPEkfnMxbKUEVPbvy7EWq/NA6cMLJ31QzPEKJlMAdk6eLSBFzSDj/puTp3HRcTeW6eu8ouWisupA/uKgWZ0DQUmZEisQe1yqz/EiS7lmUp2ScXEMmxoNgLmHHeEWAKhNcSIdKXjYpwtUxBYR7Zcrm9j8X0XBYinnPxsm5Kphg="
BEDS24_API_URL="https://api.beds24.com/v2"

# 📱 WHAPI API
WHAPI_TOKEN="hXoVA1qcPcFPQ0uh8AZckGzbPxquj7dZ"
WHAPI_API_URL="https://gate.whapi.cloud"

# 🌐 SERVIDOR
NODE_ENV="production"
PORT="3001"

# 📊 LOGGING
LOG_LEVEL="info"
LOG_PRETTY="false"

# 📈 MONITORING
PROMETHEUS_ENABLED="true"
SWAGGER_ENABLED="true"
METRICS_PREFIX="bot_data_"
```

### 4. **🔄 AGREGAR REDIS ADDON**
- En tu servicio → "Add Plugin" → "Redis"
- Railway automáticamente configurará `REDIS_URL`

### 5. **⚙️ CONFIGURAR BUILD/START COMMANDS**

Railway debería detectar automáticamente, pero si necesitas configurar:

```json
{
  "build": "cd data-sync && npm ci && npm run build",
  "start": "cd data-sync && npm run start"
}
```

## 🧪 **POST-DEPLOY TESTING**

### 1. **✅ Health Check**
```bash
curl https://tu-servicio.up.railway.app/api/health
```

**Esperado:**
```json
{
  "status": "healthy",
  "services": {
    "redis": "connected", 
    "database": "connected"
  }
}
```

### 2. **🏨 Test Webhook Beds24**
```bash
curl -X POST https://tu-servicio.up.railway.app/api/webhooks/beds24 \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"TEST123","action":"created"}'
```

**Esperado:**
```json
{
  "status": "accepted",
  "message": "Webhook queued for processing"
}
```

### 3. **📱 Test Webhook Whapi**
```bash
curl -X POST https://tu-servicio.up.railway.app/api/webhooks/whapi \
  -H "Content-Type: application/json" \
  -d '{"type":"message","data":{"from":"123","text":"test"}}'
```

### 4. **📊 Test Metrics**
```bash
curl https://tu-servicio.up.railway.app/metrics
```

### 5. **📖 Test Documentation**
```bash
curl https://tu-servicio.up.railway.app/api-docs
```

## 🔄 **CONFIGURAR WEBHOOKS EXTERNOS**

### **Beds24 Setup:**
1. Login a Beds24 → Settings → API
2. Webhook URL: `https://tu-servicio.up.railway.app/api/webhooks/beds24`
3. Events: `booking.created`, `booking.modified`, `booking.cancelled`

### **Whapi Setup:**
1. Login a Whapi → Channel Settings → Webhooks  
2. Webhook URL: `https://tu-servicio.up.railway.app/api/webhooks/whapi`
3. Events: `message`, `message_status`, `client_ready`

## 🚨 **TROUBLESHOOTING**

### **Error: Redis Connection Failed**
- Verificar que Redis addon esté instalado
- Chequear que `REDIS_URL` esté configurada

### **Error: Database Connection Failed**  
- Verificar nueva `DATABASE_URL` rotada
- Confirmar que es la misma BD que el bot principal

### **Error: Build Failed**
- Verificar que `data-sync/` contenga `package.json`
- Build command: `cd data-sync && npm ci && npm run build`

### **Webhook 404/500 Errors**
- Verificar rutas en logs Railway
- Test endpoints manualmente con curl

## 📈 **MONITORING EN PRODUCCIÓN**

### **Logs Railway:**
- Dashboard → Tu servicio → "Logs"
- Filtrar por errores: buscar "ERROR" o "WARN"

### **Métricas Útiles:**
- `bot_data_jobs_processed_total` - Jobs completados
- `bot_data_webhook_total` - Webhooks recibidos  
- `http_request_duration_seconds` - Latencia API

### **Alertas Recomendadas:**
- Error rate > 2% en 5 minutos
- Queue jobs pending > 100 por 10 minutos
- Response time P95 > 2 segundos

## ✅ **DEPLOY COMPLETADO**

Una vez que todos los tests pasen:

1. ✅ **Bot Data Service corriendo** independiente
2. ✅ **BD compartida** funcionando sin conflictos  
3. ✅ **Webhooks activos** para Beds24/Whapi
4. ✅ **APIs listas** para integración N8N
5. ✅ **Monitoreo configurado** con métricas

🎉 **¡Migración exitosa a arquitectura independiente!**