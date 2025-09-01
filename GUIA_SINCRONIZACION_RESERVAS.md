# 📚 Guía Completa de Sincronización de Reservas Beds24

## 📋 Índice
1. [Descripción General](#descripción-general)
2. [Scripts Disponibles](#scripts-disponibles)
3. [Cómo Ejecutar la Sincronización](#cómo-ejecutar-la-sincronización)
4. [Manejo de Rate Limits](#manejo-de-rate-limits)
5. [Resolución de Problemas](#resolución-de-problemas)
6. [Mantenimiento de la Base de Datos](#mantenimiento-de-la-base-de-datos)

## 📖 Descripción General

El sistema de sincronización descarga las reservas de Beds24 y las almacena en la base de datos PostgreSQL de Railway. El proceso es inteligente y maneja:

- **Creación** de nuevas reservas que no existen en la BD
- **Actualización** de reservas existentes que han sido modificadas
- **Rate limits** de la API de Beds24 (máximo 600 requests cada 5 minutos)
- **Período específico**: Agosto 2025 - Agosto 2026

## 🛠️ Scripts Disponibles

### 1. **sync:smart** (RECOMENDADO)
```bash
npm run sync:smart
```
- Maneja automáticamente los rate limits
- Si encuentra error 429, espera 6 minutos y reintenta
- Descarga todas las reservas del período en una sola llamada
- Procesa localmente para minimizar llamadas a la API

### 2. **sync:complete**
```bash
npm run sync:complete
```
- Sincronización básica sin manejo automático de rate limits
- Útil para pruebas rápidas

### 3. **sync:optimized**
```bash
npm run sync:optimized
```
- Versión optimizada que descarga todo en una llamada
- Procesa los datos localmente

## 🚀 Cómo Ejecutar la Sincronización

### Paso 1: Navegar al directorio
```bash
cd /workspace/data-sync
```

### Paso 2: Ejecutar la sincronización inteligente
```bash
npm run sync:smart
```

### Qué esperar:
```
🚀 INICIANDO SINCRONIZACIÓN CON MANEJO DE RATE LIMITS
📅 Período: 1 Agosto 2025 - 1 Agosto 2026
============================================================
📊 PASO 1: Analizando BD actual...
📊 Reservas actuales en BD: 1,203

📥 PASO 2: Descargando reservas de Beds24...
✅ Descargadas 100 reservas exitosamente

📊 CLASIFICACIÓN:
  🆕 Nuevas a crear: 30
  📝 Existentes a actualizar: 70
============================================================
🆕 CREANDO 30 RESERVAS NUEVAS...
  ✅ Completado: 30 reservas creadas

📝 ACTUALIZANDO 70 RESERVAS EXISTENTES...
  ✅ Completado: 0 reservas actualizadas (sin cambios)
============================================================
✅ SINCRONIZACIÓN COMPLETADA EXITOSAMENTE
📊 TOTAL FINAL EN BD: 1,233 reservas
```

## ⚠️ Manejo de Rate Limits

### Límites de la API de Beds24:
- **600 requests** cada 5 minutos
- Error 429: "Credit limit exceeded"

### Comportamiento del script:
1. Si encuentra error 429, automáticamente:
   - ⏰ Muestra contador de 6 minutos
   - 🔄 Reintenta después de la espera
   - ✅ Continúa donde quedó

### Ejemplo de rate limit:
```
⚠️ Rate limit detectado (429). Esperando 6 minutos...
⏱️ Tiempo restante: 5:45...
⏱️ Tiempo restante: 5:30...
...
✅ Esperando completado. Reintentando...
```

## 🔧 Resolución de Problemas

### Error: "Null constraint violation on the fields: (`leadType`)"

**Causa**: Campo obsoleto en la base de datos
**Solución**: Ya resuelto - el campo fue eliminado completamente

### Error: "Credit limit exceeded"

**Causa**: Excedido el límite de la API
**Solución**: Usar `npm run sync:smart` que maneja esto automáticamente

### Error: "Connection timeout"

**Causa**: Problemas de conexión con Railway
**Solución**: 
1. Verificar variables de entorno en `.env`
2. Verificar que el servicio esté activo en Railway

## 🗄️ Mantenimiento de la Base de Datos

### Estructura de la tabla Booking

La tabla `Booking` contiene los siguientes campos principales:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `bookingId` | String | ID único de la reserva (de Beds24) |
| `guestName` | String | Nombre del huésped |
| `status` | String | Estado de la reserva |
| `arrivalDate` | String | Fecha de llegada |
| `departureDate` | String | Fecha de salida |
| `propertyName` | String | Nombre de la propiedad |
| `phone` | String | Teléfono del huésped |
| `email` | String | Email del huésped |
| `totalCharges` | String | Total de cargos |
| `totalPayments` | String | Total de pagos |
| `balance` | String | Balance pendiente |
| `messages` | Json | Mensajes de la reserva |
| `raw` | Json | Datos completos de Beds24 |

### Triggers Activos

La tabla tiene triggers que sincronizan automáticamente con la tabla `Leads`:

1. **trg_Booking_sync_leads**: Sincroniza reservas con estado "Futura Pendiente" a Leads
2. **update_bdstatus_trigger**: Actualiza el campo BDStatus automáticamente

### Verificar Estado de la BD

```bash
cd /workspace/data-sync
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.booking.count().then(count => {
  console.log('Total de reservas en BD:', count);
  prisma.\$disconnect();
});
"
```

## 📊 Métricas y Monitoreo

### Verificar últimas sincronizaciones:
```bash
cd /workspace/data-sync
tail -n 100 logs/sync.log | grep "SINCRONIZACIÓN COMPLETADA"
```

### Verificar reservas por estado:
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.booking.groupBy({
  by: ['status'],
  _count: true
}).then(result => {
  console.log('Reservas por estado:', result);
  prisma.\$disconnect();
});
"
```

## 🔐 Seguridad y Mejores Prácticas

1. **NO ejecutar sincronizaciones simultáneas** - Puede causar duplicados
2. **Verificar logs después de cada sincronización** - Para detectar errores
3. **Hacer backup antes de sincronizaciones masivas** - Por seguridad
4. **Usar siempre `sync:smart`** - Maneja rate limits automáticamente

## 📝 Notas Importantes

- El período de sincronización está fijo: **1 Agosto 2025 - 1 Agosto 2026**
- Las actualizaciones solo ocurren si `modifiedDate` cambió
- Los mensajes nuevos en reservas se procesan inmediatamente (sin delay)
- Las modificaciones de datos se procesan con 3 minutos de delay

## 🆘 Soporte

Si encuentras problemas:

1. Revisa los logs en `/workspace/data-sync/logs/`
2. Verifica la conexión a Railway
3. Confirma que las credenciales de Beds24 estén actualizadas
4. Verifica que no haya cambios en el esquema de la BD

---

**Última actualización**: Diciembre 2024
**Versión**: 2.0 (sin campo leadType)