# Cambios en el Sistema de Procesamiento de Webhooks

## 📝 Resumen de Cambios

Se han implementado los siguientes cambios para mejorar el procesamiento de reservas:

### 1. **Reducción del Delay de 3 minutos a 1 minuto**
- **Archivo**: `/data-sync/src/server/routes/webhooks/beds24.route.ts`
- **Cambio**: El delay para modificaciones sin mensajes pasó de 180000ms (3 min) a 60000ms (1 min)
- **Razón**: 
  - Reducir el riesgo de pérdida de jobs si el servicio se reinicia
  - Procesar las reservas más rápidamente
  - Mantener suficiente tiempo para que Beds24 complete sus actualizaciones

### 2. **Procesamiento Secuencial (FIFO)**
- **Archivo**: `/data-sync/src/infra/queues/queue.manager.ts`
- **Cambio**: Concurrencia reducida de 2 a 1
- **Razón**:
  - Garantizar que las reservas se procesen en el orden exacto que llegaron
  - Evitar condiciones de carrera entre reservas relacionadas
  - Simplificar el debugging y trazabilidad

## 🔄 Flujo Actualizado

```
1. Webhook recibido (MODIFY/CREATE/CANCEL)
   ↓
2. Si es MODIFY sin mensajes → Delay de 1 minuto
   Si es MODIFY con mensajes → Procesamiento inmediato
   Si es CREATE/CANCEL → Procesamiento inmediato
   ↓
3. Job encolado en Redis con delay configurado
   ↓
4. Worker procesa en orden FIFO (uno a la vez)
   ↓
5. Sincronización con Beds24 API
   ↓
6. Upsert en base de datos (crea si no existe, actualiza si existe)
```

## 🎯 Beneficios

1. **Mayor confiabilidad**: Menos tiempo de espera = menor riesgo de pérdida por reinicio
2. **Procesamiento ordenado**: FIFO garantizado con concurrencia = 1
3. **Simplicidad**: Un solo flujo para CREATE y MODIFY (ambos usan upsert)
4. **Rapidez**: Las reservas se procesan en máximo 1 minuto

## 🚀 Despliegue

Para aplicar estos cambios en producción:

```bash
# 1. Compilar el código TypeScript
cd data-sync
npm run build

# 2. Desplegar en Railway
git add .
git commit -m "feat: reducir delay a 1 minuto y procesamiento secuencial"
git push

# Railway automáticamente desplegará los cambios
```

## 📊 Monitoreo

Después del despliegue, verificar:

1. **Logs en Railway**: Buscar el mensaje "⏰ MODIFY without messages - scheduled for 1 minute delay"
2. **Base de datos**: Las nuevas reservas deben aparecer en máximo 1-2 minutos
3. **Redis**: Los jobs deben procesarse secuencialmente

## ⚠️ Consideraciones

- **Beds24 API Rate Limits**: Con concurrencia=1 y limiter configurado, no deberíamos exceder los límites
- **Orden de procesamiento**: Es crítico que las reservas se procesen en orden para evitar inconsistencias
- **Upsert siempre funciona**: No importa si Beds24 envía CREATE o MODIFY, el upsert maneja ambos casos

## 🔍 Verificación Post-Despliegue

```sql
-- Verificar nuevas reservas en la última hora
SELECT 
  "bookingId",
  "guestName",
  "status",
  "lastUpdatedBD",
  EXTRACT(EPOCH FROM (NOW() - "lastUpdatedBD")) / 60 as minutes_ago
FROM "Booking"
WHERE "lastUpdatedBD" > NOW() - INTERVAL '1 hour'
ORDER BY "lastUpdatedBD" DESC;
```