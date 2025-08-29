# 📊 Estrategia de Sincronización de Base de Datos

## 🎯 Objetivo
Sincronizar todas las reservas de Beds24 (período: 1 Ago 2025 - 1 Ago 2026) de manera inteligente, evitando duplicados y optimizando el proceso.

## 🔑 Principios Clave

1. **`bookingId` es único** - No puede haber duplicados
2. **Sincronización incremental** - Solo actualizar lo que cambió
3. **Todos los estados** - confirmed, new, request, cancelled, black, inquiry
4. **Período específico** - Solo reservas con check-in entre 1 Ago 2025 - 1 Ago 2026

## 📋 Estrategia en 4 Fases

### FASE 1: Sincronizar Reservas Nuevas 🆕
**Objetivo**: Crear todas las reservas que NO existen en la BD

```javascript
// Lógica:
1. Obtener TODOS los IDs existentes en BD
2. Obtener TODAS las reservas del período de Beds24
3. Filtrar solo las que NO están en BD
4. Crear en lotes de 10
```

**Ventajas**:
- No hay riesgo de duplicados
- Proceso rápido para primera carga
- Identifica gaps en la BD

### FASE 2: Actualizar Modificadas Recientemente 🔄
**Objetivo**: Actualizar reservas que cambiaron en las últimas 48 horas

```javascript
// Lógica:
1. Usar parámetro modifiedFrom (últimas 48h)
2. Obtener solo reservas modificadas
3. Actualizar todas (upsert)
```

**Ventajas**:
- Captura cambios recientes
- Incluye nuevos mensajes
- Actualiza precios y estados

### FASE 3: Verificar Próximas Llegadas 📅
**Objetivo**: Asegurar que las reservas próximas estén actualizadas

```javascript
// Lógica:
1. Obtener reservas con check-in en próximos 30 días
2. Comparar fecha de modificación
3. Actualizar si hay cambios
```

**Ventajas**:
- Prioriza lo urgente
- Garantiza datos frescos para operaciones

### FASE 4: Sincronizar Canceladas ❌
**Objetivo**: Marcar correctamente las reservas canceladas

```javascript
// Lógica:
1. Obtener todas las canceladas del período
2. Verificar si existen en BD
3. Actualizar estado si difiere
```

**Ventajas**:
- Limpia estados incorrectos
- Identifica cancelaciones no procesadas

## 🚀 Scripts de Ejecución

### 1. Sincronización Completa (Primera vez o mensual)
```bash
# Ejecuta las 4 fases completas
npm run sync:all-bookings
```

**Tiempo estimado**: 10-30 minutos
**Cuándo usar**: 
- Primera sincronización
- Sincronización mensual completa
- Después de problemas de conectividad

### 2. Actualización Rápida (Diaria o por hora)
```bash
# Solo actualiza modificadas en últimas 24 horas
npm run sync:modified

# O especificar horas
npm run sync:modified 48  # últimas 48 horas
```

**Tiempo estimado**: 1-5 minutos
**Cuándo usar**:
- Actualización diaria automática
- Después de cambios masivos
- Sincronización programada (cron)

### 3. Actualización Express (Cada 2 horas)
```bash
# Solo últimas 2 horas, solo confirmadas
npm run sync:quick
```

**Tiempo estimado**: < 1 minuto
**Cuándo usar**:
- Webhook de respaldo
- Verificación rápida
- Mantener datos frescos

## 📊 Optimizaciones Implementadas

### 1. Deduplicación Inteligente
- Carga todos los IDs existentes en memoria (Set)
- Comparación O(1) para verificar duplicados
- Evita queries innecesarios a BD

### 2. Procesamiento en Lotes
- Lotes de 10-20 reservas
- Pausas entre lotes (1-2 segundos)
- Evita sobrecarga de API y BD

### 3. Comparación de Timestamps
- Solo actualiza si `modifiedTime` > `BD.modifiedDate`
- Evita escrituras innecesarias
- Reduce carga en BD

### 4. Priorización por Estado
- Primero: confirmed, new
- Después: request, inquiry
- Último: cancelled, black

## 🔍 Validaciones

Cada reserva pasa por validaciones antes de guardar:
- ✅ Montos válidos (formato decimal)
- ✅ Fechas válidas (formato ISO)
- ✅ Teléfonos limpios
- ✅ Emails válidos
- ✅ Campos truncados si exceden límites

## 📈 Métricas y Logs

### Logs Detallados
```
📊 Estado actual de la BD: 1,234 reservas
🆕 FASE 1: 156 reservas nuevas creadas
🔄 FASE 2: 89 reservas actualizadas
📅 FASE 3: 45 reservas próximas verificadas
❌ FASE 4: 12 cancelaciones procesadas
```

### Resumen Final
```
⏱️ Duración total: 245 segundos
📦 Total procesadas: 302
✅ Total creadas: 156
📝 Total actualizadas: 134
❌ Total errores: 12
```

## 🔧 Configuración de Cron

### Opción 1: Cron del Sistema
```bash
# Actualización completa mensual (día 1 a las 3 AM)
0 3 1 * * cd /app && npm run sync:all-bookings

# Actualización diaria (todos los días a las 6 AM)
0 6 * * * cd /app && npm run sync:modified

# Actualización rápida (cada 2 horas)
0 */2 * * * cd /app && npm run sync:quick
```

### Opción 2: Node-Cron (en el código)
```javascript
import cron from 'node-cron';

// Cada 2 horas
cron.schedule('0 */2 * * *', async () => {
  await quickUpdate();
});

// Diaria a las 6 AM
cron.schedule('0 6 * * *', async () => {
  await updateModifiedBookings({ hoursBack: 24 });
});
```

## ⚠️ Consideraciones

1. **Rate Limits de Beds24**
   - Máximo 600 requests por 5 minutos
   - Los scripts respetan esto con pausas

2. **Memoria**
   - Con 10,000 reservas usa ~50MB RAM
   - Procesa en lotes para grandes volúmenes

3. **Transacciones**
   - Cada reserva es una transacción independiente
   - Si falla una, las demás continúan

4. **Webhooks como Respaldo**
   - Los webhooks siguen activos
   - Esta sincronización es un respaldo/verificación

## 🎯 Resultado Esperado

Después de ejecutar la sincronización completa:
1. **100% de las reservas** del período en BD
2. **Estados correctos** para todas
3. **Mensajes actualizados**
4. **Sin duplicados**
5. **Datos validados y limpios**

## 📝 Comandos para package.json

Agregar estos scripts a `package.json`:

```json
{
  "scripts": {
    "sync:all-bookings": "node dist/scripts/sync-all-bookings.js",
    "sync:modified": "node dist/scripts/update-modified-bookings.js",
    "sync:quick": "node -e \"import('./dist/scripts/update-modified-bookings.js').then(m => m.quickUpdate())\"",
    "build:scripts": "tsc -p tsconfig.json"
  }
}
```

---

**La estrategia está diseñada para ser eficiente, evitar duplicados y mantener la BD siempre actualizada.** 🚀