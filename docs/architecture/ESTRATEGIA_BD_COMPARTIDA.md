# 🗄️ ESTRATEGIA BASE DE DATOS COMPARTIDA

## 🎯 **DECISIÓN ARQUITECTÓNICA**

**Usar la misma BD PostgreSQL para Bot Principal y Data-Sync Service**

Esta es una decisión **intencional y estratégica** para maximizar:
- ✅ **Zero Downtime** durante extracción
- ✅ **Data Consistency** (single source of truth)  
- ✅ **Desarrollo Ágil** (menos complejidad inicial)
- ✅ **Actualizaciones Incrementales** preservadas

## 🔄 **CÓMO FUNCIONAN LAS ACTUALIZACIONES INCREMENTALES**

### **Upserts Seguros por Columna**
```typescript
// Ejemplo en sync.ts
await prisma.reservas.upsert({
  where: { bookingId: 'beds24-123' },
  create: {
    bookingId: 'beds24-123',
    guestName: 'Juan Pérez',
    phone: '+57300123456',
    arrivalDate: '2025-02-15',
    status: 'confirmed'
    // ... todos los campos iniciales
  },
  update: {
    // Solo actualiza campos que cambiaron
    phone: '+57300123456',      // ✅ Actualizado
    arrivalDate: '2025-02-16',  // ✅ Actualizado
    // guestName se mantiene igual
    // status se preserva
  }
});
```

### **Preservación de Datos**
- **Campos Bot**: `lastBotInteraction`, `whatsappThreadId`, `crmNotes`
- **Campos Sync**: `lastSyncBeds24`, `beds24Status`, `apiData` 
- **Campos Compartidos**: `phone`, `guestName`, `arrivalDate` (actualizados por ambos)

## 📊 **FLUJO DE DATOS BIDIRECCIONAL**

```
┌─────────────────┐    🔄    ┌─────────────────┐
│   Bot WhatsApp  │ ◄──────► │  PostgreSQL DB  │
│                 │          │                 │
│ - Client msgs   │          │ - Reservas      │
│ - CRM data      │          │ - Leads         │
│ - User context  │          │ - HotelApart    │
└─────────────────┘          └─────────────────┘
                                       ▲
                                       │ 🔄
                                       ▼
                             ┌─────────────────┐
                             │ Data-Sync API   │
                             │                 │
                             │ - Beds24 sync   │
                             │ - Webhooks      │
                             │ - Bulk updates  │
                             └─────────────────┘
```

## ✅ **VENTAJAS CONFIRMADAS**

### **1. Zero Downtime**
- No hay migración de datos
- No hay downtime durante extracción
- Bot sigue funcionando normalmente

### **2. Data Consistency**
- Un solo source of truth
- No sincronización entre DBs
- No conflictos de datos

### **3. Actualizaciones Inteligentes**
- Upserts preservan datos existentes
- Solo actualiza campos modificados
- Ambos servicios pueden escribir sin conflictos

### **4. Desarrollo Ágil**
- Extracción inmediata
- Testing con datos reales
- Deploy independiente sencillo

## ⚠️ **CONSIDERACIONES DE SEGURIDAD**

### **Connection Pooling**
```typescript
// Prisma maneja automáticamente
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});
```

### **Transactions Safety**
- Prisma upserts son atómicos
- No hay lock contention (diferentes tablas principalmente)
- Timeouts configurados (30s)

### **Monitoring**
- Health checks detectan connection issues
- Métricas Prometheus monitoran performance
- Alertas automáticas para problemas

## 🚀 **MIGRACIÓN FUTURA (OPCIONAL)**

Si eventualmente necesitas separar las DBs:

### **Fase 1: Read Replica**
```env
# Bot Principal
DATABASE_URL="postgresql://primary-db"

# Data-Sync
DATABASE_URL="postgresql://read-replica-db" 
```

### **Fase 2: DB Independiente**
```env
# Bot Principal  
DATABASE_URL="postgresql://bot-db"

# Data-Sync
DATABASE_URL="postgresql://sync-db"
```

### **Fase 3: Sincronización**
- Event sourcing entre DBs
- CDC (Change Data Capture) 
- Message queues para sync

## 📋 **CONCLUSIÓN**

**La BD compartida es la estrategia correcta para esta etapa:**

✅ **Permite extracción inmediata sin riesgos**
✅ **Mantiene todas las funcionalidades actuales**  
✅ **Preserva actualizaciones incrementales**
✅ **Facilita desarrollo y testing**

**Esta decisión arquitectónica es sólida y permite evolución futura sin bloquear el progreso actual.**