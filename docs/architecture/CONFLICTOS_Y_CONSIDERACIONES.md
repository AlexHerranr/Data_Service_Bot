# ⚠️ CONFLICTOS Y CONSIDERACIONES - BEDS24 SYNC SERVICE

## 🚨 **CONFLICTOS CRÍTICOS IDENTIFICADOS**

### 1. **🗄️ BASE DE DATOS COMPARTIDA**
**Problema**: Ambos servicios apuntan a la misma base de datos PostgreSQL
```env
DATABASE_URL="postgresql://postgres:slTVdKuHwjEfvxJEjGtMVTwSTYzdbfuR@turntable.proxy.rlwy.net:43146/railway"
```

**Riesgos**:
- ✅ **BAJO RIESGO ACTUAL**: Solo lectura/inserción en Beds24 Sync
- ⚠️ **RIESGO MEDIO**: Concurrencia en tabla `Booking` y `Leads`
- 🔥 **RIESGO ALTO**: Migraciones simultáneas pueden romper esquema

**Soluciones**:
- **DESARROLLO**: Mantener DB compartida (monitorear locks)
- **PRODUCCIÓN**: DB independiente o read replicas

### 2. **🔑 BEDS24 TOKEN COMPARTIDO**
**Problema**: Mismo token API usado por ambos servicios
```env
BEDS24_TOKEN="gLNPEkfnMxbKUEVPbvy7EWq/NA6cMLJ31QzPEKJlMAdk6..."
```

**Riesgos**:
- ⚠️ **RATE LIMITING**: API Beds24 puede limitar requests combinados
- 📊 **TRACKING**: Difícil identificar origen de requests en logs Beds24
- 🔒 **SEGURIDAD**: Un compromiso afecta ambos servicios

**Soluciones**:
- **IDEAL**: Tokens separados para cada servicio
- **TEMPORAL**: Monitorear rate limits de Beds24

### 3. **🔄 REDIS KEYS COLLISION**
**Problema**: Ambos servicios usan la misma instancia Redis
```env
REDIS_URL="redis://localhost:6379"
```

**Riesgos**:
- 🔥 **COLISIÓN DE KEYS**: BullMQ queues, cache keys pueden mezclarse
- 📈 **MÉTRICAS CONFUSAS**: Keys de diferentes servicios en misma instancia
- 🚀 **PERFORMANCE**: Memoria compartida puede causar bottlenecks

**Soluciones**:
- **INMEDIATA**: Usar prefijos diferentes (`data_sync_` vs `bot_`)
- **PRODUCCIÓN**: Instancias Redis separadas

### 4. **🌐 PUERTOS Y SERVICIOS**
**Conflicto**: Potencial colisión de puertos en desarrollo
```
Bot Principal: PORT=3008
Sync Service: PORT=3001
```

**Riesgos**:
- ✅ **BAJO RIESGO**: Puertos diferentes ya configurados
- ⚠️ **DESARROLLO**: Confusión sobre qué servicio está en qué puerto

---

## 📋 **PLAN DE MITIGACIÓN**

### **FASE 1: DESARROLLO SEGURO (Actual)**
```bash
# Bot Principal
PORT=3008
REDIS_PREFIX="bot_"
METRICS_PREFIX="bot_"

# Sync Service  
PORT=3001
REDIS_PREFIX="data_sync_"
METRICS_PREFIX="data_sync_"
```

### **FASE 2: SEPARACIÓN GRADUAL (Próxima)**
1. **Redis independiente** para Sync Service
2. **Read replica** de PostgreSQL para Sync Service
3. **Token Beds24 separado** (si es posible)

### **FASE 3: INDEPENDENCIA TOTAL (Futuro)**
1. **Base de datos independiente** con sincronización
2. **Infrastructure as Code** (Terraform/Pulumi)
3. **Monitoring independiente** (Grafana separado)

---

## 🔍 **MONITOREO DE CONFLICTOS**

### **Alertas Recomendadas**:
```
- Database connection pool exhaustion
- Redis memory usage > 80%
- Beds24 API rate limit warnings
- Concurrent Prisma migrations
- Queue processing delays
```

### **Logs Críticos**:
```
- Database lock timeouts
- Redis key collisions
- Beds24 API 429 responses
- Prisma migration conflicts
```

---

## ✅ **ESTADO ACTUAL: DESARROLLO SEGURO**

**Evaluación de riesgos**:
- 🟢 **DESARROLLO**: Seguro para desarrollo y testing
- 🟡 **STAGING**: Monitoreo requerido
- 🔴 **PRODUCCIÓN**: Separación recomendada

**Recomendación**: 
- ✅ **Proceder con migración** para desarrollo
- ⚠️ **Planificar separación** para producción
- 📊 **Implementar monitoreo** desde el inicio