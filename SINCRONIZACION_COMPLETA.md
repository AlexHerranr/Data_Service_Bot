# 🔄 SINCRONIZACIÓN COMPLETA DE RESERVAS

## 🎯 Objetivo
Sincronizar **TODAS** las reservas del período **Agosto 2025 - Agosto 2026** con la base de datos.

## ✅ Qué hace el script

1. **CREA todas las reservas nuevas** que no existen en la BD
2. **ACTUALIZA todas las reservas existentes** sin importar cuándo se modificaron

## 🚀 Cómo ejecutar

```bash
cd /workspace/data-sync
npm run sync:complete
```

## 📊 Qué esperar

El script te mostrará:

```
🚀 INICIANDO SINCRONIZACIÓN COMPLETA
📅 Período: 1 Agosto 2025 - 1 Agosto 2026
============================================================
📊 PASO 1: Analizando BD actual...
📊 Reservas actuales en BD: 1,234

📥 PASO 2: Descargando TODAS las reservas de Beds24...
✅ Obtenidas 2,456 reservas de Beds24

📊 CLASIFICACIÓN:
  🆕 Nuevas a crear: 1,222
  📝 Existentes a actualizar: 1,234
============================================================

🆕 CREANDO 1,222 RESERVAS NUEVAS...
📦 Procesando lote 1/123 (10 reservas)
✅ Creada: 999001 - John Doe (2025-09-15)
✅ Creada: 999002 - Jane Smith (2025-09-20)
...

📝 ACTUALIZANDO 1,234 RESERVAS EXISTENTES...
📦 Procesando lote 1/83 (15 reservas)
📝 Actualizada: 888001 - Cliente Uno
📝 Actualizada: 888002 - Cliente Dos
...

============================================================
✅ SINCRONIZACIÓN COMPLETA FINALIZADA
============================================================
📊 RESUMEN:
  ⏱️  Duración: 15m 32s
  📥 Total en Beds24: 2,456
  📊 Existían en BD: 1,234
  ✅ Creadas: 1,222
  📝 Actualizadas: 1,234
  ❌ Errores: 0
============================================================
📊 TOTAL FINAL EN BD: 2,456 reservas
============================================================
```

## ⏱️ Tiempo estimado

- **10-30 minutos** dependiendo del número de reservas
- Procesa en lotes de 10-15 reservas
- Incluye pausas automáticas para no sobrecargar

## 🔍 Características

- **Incluye TODOS los estados**: confirmed, new, request, cancelled, black, inquiry
- **Período fijo**: 1 Agosto 2025 - 1 Agosto 2026
- **Sin filtros de tiempo**: Actualiza TODO, no solo cambios recientes
- **Logs detallados**: Verás exactamente qué se está procesando
- **Manejo de errores**: Si falla una reserva, continúa con las demás

## ⚠️ Importante

- Este script actualiza **TODAS** las reservas del período
- No importa si la BD lleva semanas sin actualizarse
- Sincroniza el estado completo de Beds24 a tu BD
- Los webhooks seguirán funcionando para cambios en tiempo real

## 🛠️ Después de ejecutar

Una vez completada la sincronización:

1. Tu BD estará 100% sincronizada con Beds24
2. Los webhooks mantendrán los cambios futuros actualizados
3. Puedes programar sincronizaciones periódicas con `sync:modified` para cambios recientes

## 📝 Comando

```bash
npm run sync:complete
```

**¡Eso es todo! El script se encarga del resto.** 🚀