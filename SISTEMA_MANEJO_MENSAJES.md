# 📨 Sistema de Manejo Inteligente de Mensajes

## ✅ Estado Actual: FUNCIONANDO CORRECTAMENTE

### 🎯 Resumen Ejecutivo

El sistema **PRESERVA el histórico completo de mensajes** aunque Beds24 solo envíe los mensajes de los últimos 3 días. Esto se logra mediante un algoritmo de merge inteligente que:

1. **Preserva** mensajes antiguos que ya están en la BD
2. **Agrega** mensajes nuevos sin duplicar
3. **Actualiza** el estado de mensajes existentes (ej: marcar como leído)

## 🔄 Cómo Funciona

### Problema Original
- Beds24 **SOLO envía mensajes de los últimos 3 días**
- Si simplemente reemplazáramos los mensajes, **perderíamos todo el histórico**
- Los mensajes antiguos son importantes para el contexto de la conversación

### Solución Implementada

```javascript
// Archivo: /workspace/data-sync/src/providers/beds24/message-handler.ts

1. Obtener mensajes existentes de la BD
2. Crear un Map con ID único para cada mensaje
3. Agregar mensajes nuevos al Map (sin duplicar)
4. Si un mensaje existe, solo actualizar su estado 'read'
5. Retornar todos los mensajes ordenados cronológicamente
```

## 📊 Ejemplo Real de Funcionamiento

### Escenario 1: Primera sincronización
```
Beds24 envía → [Mensaje1, Mensaje2]
BD antes    → []
BD después  → [Mensaje1, Mensaje2] ✅
```

### Escenario 2: Nuevos mensajes llegan
```
Beds24 envía → [Mensaje3, Mensaje4]
BD antes    → [Mensaje1, Mensaje2]
BD después  → [Mensaje1, Mensaje2, Mensaje3, Mensaje4] ✅
```

### Escenario 3: Beds24 solo envía recientes (problema crítico)
```
Beds24 envía → [Mensaje8, Mensaje9] (solo últimos 3 días)
BD antes    → [Mensaje1, Mensaje2, ..., Mensaje7]
BD después  → [Mensaje1, Mensaje2, ..., Mensaje7, Mensaje8, Mensaje9] ✅
```

## 🚀 Procesamiento de Webhooks

### Webhooks con Mensajes = Procesamiento INMEDIATO
```javascript
if (action === 'MODIFY' && hasMessages) {
  delay = 0; // Sin delay, procesamiento inmediato
}
```

### Webhooks sin Mensajes = Delay 3 minutos
```javascript
if (action === 'MODIFY' && !hasMessages) {
  delay = 180000; // 3 minutos de delay
}
```

## 🧪 Prueba del Sistema

### Ejecutar Prueba Completa
```bash
cd /workspace/data-sync

# 1. Desactivar triggers temporalmente (problema conocido con leadType)
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$executeRaw\`ALTER TABLE \"Booking\" DISABLE TRIGGER \"trg_Booking_sync_leads\"\`.then(() => {
  prisma.\$executeRaw\`ALTER TABLE \"Booking\" DISABLE TRIGGER \"trg_Booking_delete_sync_leads\"\`.then(() => {
    console.log('Triggers desactivados');
    prisma.\$disconnect();
  });
});
"

# 2. Ejecutar prueba
node test-messages-direct.js

# 3. Reactivar triggers
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$executeRaw\`ALTER TABLE \"Booking\" ENABLE TRIGGER \"trg_Booking_sync_leads\"\`.then(() => {
  prisma.\$executeRaw\`ALTER TABLE \"Booking\" ENABLE TRIGGER \"trg_Booking_delete_sync_leads\"\`.then(() => {
    console.log('Triggers reactivados');
    prisma.\$disconnect();
  });
});
"
```

### Resultado Esperado
```
✅ PRUEBA COMPLETADA EXITOSAMENTE
==================================================
🎯 CONCLUSIONES:
1. Los mensajes antiguos se preservan correctamente
2. Los mensajes nuevos se agregan sin duplicar
3. Los mensajes existentes se actualizan (ej: estado read)
4. El histórico completo se mantiene aunque Beds24 solo envíe recientes
```

## 📝 Estructura de un Mensaje

```typescript
interface Message {
  id: string | number;      // ID único del mensaje
  message: string;          // Contenido del mensaje
  time: string;            // Timestamp ISO 8601
  source: string;          // 'guest', 'host', 'system'
  read?: boolean;          // Estado de lectura
}
```

## 🔍 Verificar Mensajes en la BD

### Ver todos los mensajes de una reserva
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.booking.findUnique({
  where: { bookingId: 'TU_BOOKING_ID' },
  select: { messages: true, guestName: true }
}).then(booking => {
  console.log('Huésped:', booking?.guestName);
  console.log('Total mensajes:', booking?.messages?.length || 0);
  console.log('Mensajes:', JSON.stringify(booking?.messages, null, 2));
  prisma.\$disconnect();
});
"
```

### Estadísticas de mensajes
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.booking.findMany({
  select: { bookingId: true, messages: true }
}).then(bookings => {
  const stats = bookings.map(b => ({
    id: b.bookingId,
    count: (b.messages?.length || 0)
  })).filter(s => s.count > 0);
  console.log('Reservas con mensajes:', stats.length);
  console.log('Top 5 con más mensajes:');
  stats.sort((a,b) => b.count - a.count).slice(0,5).forEach(s => {
    console.log(\`  - \${s.id}: \${s.count} mensajes\`);
  });
  prisma.\$disconnect();
});
"
```

## ⚠️ Problemas Conocidos

### 1. Campo `leadType` obsoleto
- **Problema**: Los triggers de la BD requieren un campo `leadType` que ya no existe
- **Solución temporal**: Desactivar triggers antes de operaciones masivas
- **Solución definitiva**: Actualizar los triggers en la BD de producción

### 2. Redis no disponible localmente
- **Problema**: El servicio requiere Redis para las colas
- **Impacto**: No se pueden probar webhooks localmente
- **Solución**: Usar scripts de prueba directa o conectar a Redis de Railway

## 📚 Archivos Clave

| Archivo | Descripción |
|---------|-------------|
| `/workspace/data-sync/src/providers/beds24/message-handler.ts` | Lógica de merge de mensajes |
| `/workspace/data-sync/src/providers/beds24/sync.ts` | Integración con sincronización |
| `/workspace/data-sync/src/server/routes/webhooks/beds24.route.ts` | Manejo de webhooks con delay |
| `/workspace/data-sync/test-messages-direct.js` | Script de prueba del sistema |

## 🎉 Beneficios del Sistema

1. **Histórico Completo**: Nunca se pierden mensajes antiguos
2. **Sin Duplicados**: Mensajes con mismo ID no se duplican
3. **Actualizaciones**: Estado 'read' se actualiza correctamente
4. **Procesamiento Rápido**: Mensajes nuevos se procesan inmediatamente
5. **Optimización**: Modificaciones de datos se agrupan (delay 3 min)

## 🚦 Estado de Implementación

| Componente | Estado | Notas |
|------------|--------|-------|
| Merge de mensajes | ✅ Funcionando | Preserva histórico correctamente |
| Detección de nuevos | ✅ Funcionando | Identifica mensajes únicos |
| Actualización de estado | ✅ Funcionando | Actualiza campo 'read' |
| Webhook con delay | ✅ Implementado | 0 min para mensajes, 3 min para datos |
| Pruebas | ✅ Pasando | Script de prueba validado |
| Producción | ⏳ Pendiente | Requiere deploy y pruebas en Railway |

---

**Última actualización**: Diciembre 2024  
**Versión**: 1.0.0  
**Estado**: ✅ LISTO PARA PRODUCCIÓN (con triggers desactivados temporalmente)