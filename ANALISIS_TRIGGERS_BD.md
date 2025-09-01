# 🔍 Análisis de Triggers en Base de Datos

## 📋 Resumen Ejecutivo

La base de datos tiene **3 triggers activos** en la tabla `Booking` que necesitan optimización. El principal problema es un campo obsoleto `leadType` que causa errores en las operaciones.

## 🎯 Triggers Actuales

### 1. **trg_Booking_sync_leads** ✅ ACTIVO
- **Evento**: AFTER INSERT OR UPDATE
- **Función**: `booking_sync_leads()`
- **Propósito**: Sincroniza reservas con BDStatus "Futura Pendiente" a la tabla Leads
- **Columnas monitoreadas**: BDStatus, guestName, propertyName, arrivalDate, departureDate, totalPersons, channel, lastUpdatedBD

### 2. **trg_Booking_delete_sync_leads** ✅ ACTIVO
- **Evento**: AFTER DELETE
- **Función**: `booking_sync_leads()`
- **Propósito**: Elimina el lead cuando se borra una reserva

### 3. **update_bdstatus_trigger** ✅ ACTIVO
- **Evento**: BEFORE INSERT OR UPDATE
- **Función**: `calculate_bdstatus()`
- **Propósito**: Calcula automáticamente el BDStatus basado en reglas de negocio
- **Columnas monitoreadas**: status, arrivalDate, payments, channel

## ⚠️ Problema Principal Identificado

### Campo `leadType` Obsoleto

**Situación actual:**
- ❌ La tabla `Leads` tiene una columna `leadType` que es **NOT NULL** sin valor por defecto
- ❌ El trigger `booking_sync_leads()` NO incluye `leadType` en su INSERT
- ❌ Esto causa error: `Null constraint violation on the fields: (leadType)`

**Impacto:**
- No se pueden crear nuevas reservas sin desactivar los triggers
- La sincronización automática con Leads está rota
- Afecta la operación normal del sistema

## 📊 Análisis Detallado de Funciones

### 1. Función `booking_sync_leads()`

**Lógica actual:**
```sql
IF NEW."BDStatus" = 'Futura Pendiente' THEN
  -- Inserta o actualiza en Leads
  INSERT INTO "Leads" (...) VALUES (...)
  ON CONFLICT ("bookingId") DO UPDATE SET ...
ELSE
  -- Elimina de Leads si existe
  DELETE FROM "Leads" WHERE "bookingId" = NEW."bookingId"
END IF
```

**Campos que maneja:**
- ✅ bookingId, source, channel, guestName
- ✅ propertyName, arrivalDate, departureDate
- ✅ totalPersons, numNights, phone
- ✅ lastUpdatedLeads, priority
- ❌ **NO maneja leadType** (causa del error)

### 2. Función `calculate_bdstatus()`

**Reglas de negocio:**
1. **Canceladas**: 
   - Futura → "Cancelada Futura"
   - Pasada → "Cancelada Pasada"

2. **Fechas Futuras** (arrivalDate >= hoy):
   - Airbnb/Expedia → "Futura Confirmada"
   - Otros con pagos → "Futura Confirmada"
   - Sin pagos → "Futura Pendiente"

3. **Fechas Pasadas** (arrivalDate < hoy):
   - Airbnb/Expedia → "Pasada Confirmada"
   - Otros con pagos → "Pasada Confirmada"
   - Resto → NULL

## 🛠️ Recomendaciones de Optimización

### 🔴 URGENTE - Resolver problema `leadType`

**Opción 1: Eliminar columna (RECOMENDADA)**
```sql
-- Eliminar completamente la columna leadType de Leads
ALTER TABLE "Leads" DROP COLUMN "leadType";
```

**Opción 2: Hacer nullable con default**
```sql
-- Hacer la columna opcional con valor por defecto
ALTER TABLE "Leads" 
  ALTER COLUMN "leadType" DROP NOT NULL,
  ALTER COLUMN "leadType" SET DEFAULT 'booking';
```

**Opción 3: Modificar trigger para incluir leadType**
```sql
-- Agregar leadType al INSERT del trigger
INSERT INTO "Leads" (
  ...,
  "leadType"  -- Agregar esta línea
) VALUES (
  ...,
  'booking'   -- Agregar este valor
)
```

### 🟡 MEJORAS - Optimización de triggers

#### 1. **Mejorar performance del trigger `booking_sync_leads`**
- Agregar condición para evitar updates innecesarios
- Solo sincronizar si realmente cambió el BDStatus

```sql
-- Agregar al inicio del trigger
IF (TG_OP = 'UPDATE' AND OLD."BDStatus" = NEW."BDStatus") THEN
  RETURN NEW; -- No hacer nada si BDStatus no cambió
END IF;
```

#### 2. **Optimizar `calculate_bdstatus`**
- Cachear el cálculo de JSONB_ARRAY_LENGTH
- Usar índices parciales para las búsquedas

#### 3. **Agregar logging para debugging**
- Crear tabla de auditoría para trackear cambios
- Útil para debugging en producción

### 🟢 MANTENER - Funcionalidades que están bien

1. ✅ **Lógica de BDStatus**: Las reglas de negocio están claras y bien implementadas
2. ✅ **Sincronización con Leads**: El concepto es bueno, solo necesita el fix de leadType
3. ✅ **ON CONFLICT DO UPDATE**: Evita duplicados correctamente

## 📝 Script de Migración Completo

```sql
-- ========================================
-- SCRIPT DE MIGRACIÓN DE TRIGGERS
-- ========================================

-- 1. BACKUP: Crear snapshot de la tabla Leads
CREATE TABLE "Leads_backup_20241227" AS SELECT * FROM "Leads";

-- 2. Desactivar triggers temporalmente
ALTER TABLE "Booking" DISABLE TRIGGER "trg_Booking_sync_leads";
ALTER TABLE "Booking" DISABLE TRIGGER "trg_Booking_delete_sync_leads";

-- 3. Eliminar columna leadType de Leads (OPCIÓN RECOMENDADA)
ALTER TABLE "Leads" DROP COLUMN IF EXISTS "leadType";

-- Alternativa: Hacer nullable con default
-- ALTER TABLE "Leads" 
--   ALTER COLUMN "leadType" DROP NOT NULL,
--   ALTER COLUMN "leadType" SET DEFAULT 'booking';

-- 4. Optimizar trigger booking_sync_leads
CREATE OR REPLACE FUNCTION booking_sync_leads() RETURNS TRIGGER AS $$
BEGIN
  -- Optimización: Skip si BDStatus no cambió en UPDATE
  IF (TG_OP = 'UPDATE' AND OLD."BDStatus" IS NOT DISTINCT FROM NEW."BDStatus") THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE') THEN
    IF NEW."BDStatus" = 'Futura Pendiente' THEN
      INSERT INTO "Leads" (
        "bookingId", "source", "channel", "guestName", "propertyName",
        "arrivalDate", "departureDate", "totalPersons", "numNights",
        "phone", "lastUpdatedLeads", "priority"
      )
      VALUES (
        NEW."bookingId",
        'beds24',
        NEW."channel",
        NEW."guestName",
        NEW."propertyName",
        NEW."arrivalDate",
        NEW."departureDate",
        NEW."totalPersons",
        NEW."numNights",
        COALESCE(NEW."phone",'N/A'),
        NEW."lastUpdatedBD",
        'alta'
      )
      ON CONFLICT ("bookingId") DO UPDATE SET
        "source"            = EXCLUDED."source",
        "channel"           = EXCLUDED."channel",
        "guestName"         = EXCLUDED."guestName",
        "propertyName"      = EXCLUDED."propertyName",
        "arrivalDate"       = EXCLUDED."arrivalDate",
        "departureDate"     = EXCLUDED."departureDate",
        "totalPersons"      = EXCLUDED."totalPersons",
        "numNights"         = EXCLUDED."numNights",
        "phone"             = EXCLUDED."phone",
        "lastUpdatedLeads"  = EXCLUDED."lastUpdatedLeads",
        "priority"          = EXCLUDED."priority";
    ELSE
      DELETE FROM "Leads" WHERE "bookingId" = NEW."bookingId";
    END IF;
    
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    DELETE FROM "Leads" WHERE "bookingId" = OLD."bookingId";
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 5. Reactivar triggers
ALTER TABLE "Booking" ENABLE TRIGGER "trg_Booking_sync_leads";
ALTER TABLE "Booking" ENABLE TRIGGER "trg_Booking_delete_sync_leads";

-- 6. Verificar que todo funciona
-- Insertar una reserva de prueba
INSERT INTO "Booking" (
  "bookingId", "guestName", "status", "arrivalDate", 
  "departureDate", "propertyName", "phone", "BDStatus"
) VALUES (
  'TEST-001', 'Test Guest', 'new', '2025-12-30', 
  '2025-12-31', 'Test Property', '+57 300 1234567', 'Futura Pendiente'
);

-- Verificar que se creó el Lead
SELECT * FROM "Leads" WHERE "bookingId" = 'TEST-001';

-- Limpiar prueba
DELETE FROM "Booking" WHERE "bookingId" = 'TEST-001';
```

## 🚀 Plan de Implementación

### Fase 1: Desarrollo (Inmediato)
1. ✅ Ejecutar script de migración en ambiente de desarrollo
2. ✅ Probar creación/modificación de reservas
3. ✅ Verificar sincronización con Leads

### Fase 2: Staging (1-2 días)
1. ⏳ Aplicar cambios en Railway staging
2. ⏳ Ejecutar pruebas de regresión
3. ⏳ Monitorear logs por 24 horas

### Fase 3: Producción (3-5 días)
1. ⏳ Backup completo de BD
2. ⏳ Aplicar migración en ventana de mantenimiento
3. ⏳ Monitoreo intensivo post-deploy

## 📊 Métricas de Éxito

- ✅ 0 errores de `Null constraint violation`
- ✅ 100% de reservas "Futura Pendiente" sincronizadas a Leads
- ✅ Reducción del 20% en tiempo de procesamiento de triggers
- ✅ Logs limpios sin errores de triggers

## 🔍 Comandos de Verificación

```bash
# Verificar estado de triggers
psql -c "SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = '\"Booking\"'::regclass;"

# Contar registros en Leads
psql -c "SELECT COUNT(*) FROM \"Leads\";"

# Ver últimas reservas con BDStatus
psql -c "SELECT \"bookingId\", \"BDStatus\", \"createdAt\" FROM \"Booking\" ORDER BY \"createdAt\" DESC LIMIT 10;"

# Verificar sincronización
psql -c "
  SELECT b.\"bookingId\", b.\"BDStatus\", 
         CASE WHEN l.\"bookingId\" IS NOT NULL THEN 'SI' ELSE 'NO' END as en_leads
  FROM \"Booking\" b
  LEFT JOIN \"Leads\" l ON b.\"bookingId\" = l.\"bookingId\"
  WHERE b.\"BDStatus\" = 'Futura Pendiente'
  LIMIT 10;
"
```

---

**Documento creado**: 27 de Diciembre 2024  
**Prioridad**: 🔴 ALTA - Resolver problema leadType impide operación normal  
**Tiempo estimado**: 2-4 horas de implementación y pruebas