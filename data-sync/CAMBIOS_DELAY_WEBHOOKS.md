# 📋 Cambios Implementados - Sistema de Delay para Webhooks

## 🎯 Objetivo
Implementar un sistema de colas inteligente para los webhooks de Beds24:
- **Reservas nuevas (CREATED)**: Procesamiento inmediato
- **Modificaciones (MODIFY)**: Delay de 3 minutos para agrupar cambios múltiples
- **Cancelaciones (CANCEL)**: Procesamiento inmediato

## 🔧 Archivos Modificados

### 1. `/data-sync/src/server/routes/webhooks/beds24.route.ts`
**Cambios principales:**
- Añadida lógica para determinar el delay basado en la acción del webhook
- Para `MODIFY`: se programa con delay de 180000ms (3 minutos)
- Para `CREATED` y `CANCEL`: procesamiento inmediato
- Logs detallados con información del delay y tiempo programado

```typescript
// Determinar el delay basado en la acción
let jobDelay = 0; // Por defecto sin delay
let delayReason = 'immediate';

if (action === 'MODIFY') {
  // Para modificaciones, esperar 3 minutos (180000 ms)
  jobDelay = 180000; // 3 minutos en milisegundos
  delayReason = '3-minute-delay-for-modifications';
  
  logger.info({ 
    bookingId, 
    action,
    delayMinutes: 3,
    delayMs: jobDelay,
    scheduledFor: new Date(Date.now() + jobDelay).toISOString()
  }, '⏰ MODIFY webhook scheduled for 3 minutes delay');
}
```

### 2. `/data-sync/src/infra/queues/queue.manager.ts`
**Cambios principales:**

#### a) Worker mejorado con logging de timing:
```typescript
// Log detallado del timing del job
const jobCreatedAt = new Date(job.timestamp);
const jobProcessedAt = new Date();
const delayMs = jobProcessedAt.getTime() - jobCreatedAt.getTime();

logger.info({ 
  jobId: job.id, 
  type: data.type, 
  createdAt: jobCreatedAt.toISOString(),
  processedAt: jobProcessedAt.toISOString(),
  actualDelayMs: delayMs,
  actualDelayMinutes: (delayMs / 60000).toFixed(2),
  scheduledDelay: job.opts.delay || 0,
  delayReason: (data as any).delayReason || 'none'
}, '🚀 STEP 1: Processing job started');
```

#### b) Deduplicación inteligente para MODIFY:
```typescript
if (existingJob && !existingJob.isCompleted() && !existingJob.isFailed()) {
  // Si ya existe un job para esta reserva, verificar si es una modificación
  if (data.action === 'MODIFY' && options?.delay) {
    // Si es una modificación con delay, cancelar el job anterior y crear uno nuevo
    logger.info({ 
      bookingId: data.bookingId, 
      existingJobId: existingJob.id,
      newDelay: options.delay 
    }, 'Cancelling existing job and scheduling new MODIFY with delay');
    
    await existingJob.remove();
    // Continuar para crear el nuevo job con delay
  }
}
```

#### c) Logging mejorado en addWebhookJob:
```typescript
logger.info({ 
  jobId: job.id,
  bookingId: jobData.bookingId,
  action: jobData.action,
  delay: options?.delay || 0,
  delayMinutes: options?.delay ? (options.delay / 60000).toFixed(2) : 0,
  scheduledFor: options?.delay ? new Date(Date.now() + options.delay).toISOString() : 'immediate',
  delayReason: jobData.delayReason || 'none'
}, 'Webhook job queued');
```

## 📊 Logs de Debug Añadidos

Los nuevos logs permiten rastrear:
1. **Cuándo se recibe el webhook** y qué acción tiene
2. **Si se programa con delay** y cuánto tiempo
3. **Cuándo se procesa realmente** el job
4. **El delay real vs el programado**
5. **Si se cancela un job anterior** por una nueva modificación

## 🧪 Script de Prueba

Se creó `test-webhook-delay.sh` para probar el sistema:
- Envía webhooks de prueba con diferentes acciones
- Simula múltiples modificaciones de la misma reserva
- Permite verificar que el sistema funciona correctamente

## 📈 Beneficios

1. **Optimización de BD**: Las modificaciones múltiples se agrupan, reduciendo escrituras
2. **Mejor rendimiento**: Menos llamadas a la API de Beds24
3. **Datos más consistentes**: Se obtiene el estado final después de todas las modificaciones
4. **Logs detallados**: Facilita el debugging y monitoreo
5. **Deduplicación inteligente**: Evita procesar modificaciones obsoletas

## 🔍 Cómo Verificar que Funciona

1. **Ver logs en tiempo real:**
```bash
docker logs -f data-sync-app-1 2>&1 | grep -E "webhook|delay|MODIFY|CREATED"
```

2. **Buscar estos mensajes clave:**
- `⏰ MODIFY webhook scheduled for 3 minutes delay` - Cuando se programa una modificación
- `🚀 CREATED webhook will be processed immediately` - Para reservas nuevas
- `❌ CANCEL webhook will be processed immediately` - Para cancelaciones
- `Cancelling existing job and scheduling new MODIFY with delay` - Cuando se reemplaza una modificación

3. **Verificar en la BD de Railway:**
- Las reservas nuevas deben aparecer inmediatamente
- Las modificaciones deben actualizarse ~3 minutos después del webhook
- Las cancelaciones deben marcarse como canceladas inmediatamente

## 🚀 Próximos Pasos

1. **Probar con webhooks reales** de Beds24
2. **Monitorear los logs** durante las pruebas
3. **Verificar en la BD** que los cambios se aplican correctamente
4. **Ajustar el delay** si es necesario (actualmente 3 minutos)
5. **Considerar añadir configuración** para el delay en variables de entorno