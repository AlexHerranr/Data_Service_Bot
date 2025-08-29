-- ============================================================
-- SCRIPT DE OPTIMIZACIÓN TABLA LEADS
-- Objetivo: Simplificar tabla para gestión comercial
-- Fecha: 2025-01-29
-- ============================================================

-- 1. BACKUP DE DATOS ACTUALES
-- ============================================================
CREATE TEMP TABLE leads_backup AS 
SELECT 
    "bookingId",
    "guestName", 
    "phone",
    "propertyName",
    "arrivalDate",
    "departureDate",
    "numNights",
    "totalPersons",
    "channel",
    "createdAt"
FROM "Leads"
WHERE "bookingId" IS NOT NULL;

-- Verificar backup
SELECT COUNT(*) as total_backup FROM leads_backup;

-- 2. CREAR NUEVA TABLA CON ESTRUCTURA OPTIMIZADA
-- ============================================================
DROP TABLE IF EXISTS "Leads_new";

CREATE TABLE "Leads_new" (
    "id" SERIAL PRIMARY KEY,
    "bookingId" VARCHAR(255) NOT NULL UNIQUE,
    "guestName" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "propertyName" VARCHAR(255) NOT NULL,
    "arrivalDate" DATE NOT NULL,
    "departureDate" DATE NOT NULL,
    "numNights" INTEGER NOT NULL,
    "totalPersons" INTEGER NOT NULL,
    "channel" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. CREAR ÍNDICES OPTIMIZADOS
-- ============================================================
CREATE INDEX "idx_Leads_new_arrivalDate" ON "Leads_new"("arrivalDate");
CREATE INDEX "idx_Leads_new_phone" ON "Leads_new"("phone");
CREATE INDEX "idx_Leads_new_channel" ON "Leads_new"("channel");
CREATE INDEX "idx_Leads_new_propertyName_arrivalDate" ON "Leads_new"("propertyName", "arrivalDate");

-- 4. MIGRAR DATOS DEL BACKUP
-- ============================================================
INSERT INTO "Leads_new" (
    "bookingId", 
    "guestName", 
    "phone", 
    "propertyName",
    "arrivalDate", 
    "departureDate", 
    "numNights", 
    "totalPersons", 
    "channel", 
    "createdAt"
)
SELECT 
    "bookingId",
    COALESCE("guestName", 'Sin nombre'),
    COALESCE("phone", 'Sin teléfono'),
    COALESCE("propertyName", 'Sin propiedad'),
    "arrivalDate"::date,
    COALESCE("departureDate", "arrivalDate")::date,
    COALESCE(
        "numNights",
        EXTRACT(DAY FROM ("departureDate"::date - "arrivalDate"::date)),
        1
    ),
    COALESCE("totalPersons", 1),
    COALESCE("channel", 'Direct'),
    COALESCE("createdAt", CURRENT_TIMESTAMP)
FROM leads_backup;

-- Verificar migración
SELECT COUNT(*) as total_migrados FROM "Leads_new";

-- 5. ACTUALIZAR FUNCIÓN DE SINCRONIZACIÓN
-- ============================================================
CREATE OR REPLACE FUNCTION public.booking_sync_leads()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_num_nights INTEGER;
BEGIN
  IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE') THEN
    -- Solo procesar si es Futura Pendiente
    IF NEW."BDStatus" = 'Futura Pendiente' THEN
      -- Calcular número de noches
      v_num_nights := COALESCE(
        NEW."numNights",
        EXTRACT(DAY FROM (NEW."departureDate"::date - NEW."arrivalDate"::date)),
        1
      );
      
      -- Insertar o actualizar en Leads
      INSERT INTO "Leads" (
        "bookingId", "guestName", "phone", "propertyName",
        "arrivalDate", "departureDate", "numNights", 
        "totalPersons", "channel"
      )
      VALUES (
        NEW."bookingId",
        COALESCE(NEW."guestName", 'Sin nombre'),
        COALESCE(NEW."phone", 'Sin teléfono'),
        COALESCE(NEW."propertyName", 'Sin propiedad'),
        NEW."arrivalDate"::date,
        COALESCE(NEW."departureDate", NEW."arrivalDate")::date,
        v_num_nights,
        COALESCE(NEW."totalPersons", 1),
        COALESCE(NEW."channel", 'Direct')
      )
      ON CONFLICT ("bookingId") DO UPDATE SET
        "guestName"    = EXCLUDED."guestName",
        "phone"        = EXCLUDED."phone",
        "propertyName" = EXCLUDED."propertyName",
        "arrivalDate"  = EXCLUDED."arrivalDate",
        "departureDate"= EXCLUDED."departureDate",
        "numNights"    = EXCLUDED."numNights",
        "totalPersons" = EXCLUDED."totalPersons",
        "channel"      = EXCLUDED."channel";
        
      RAISE NOTICE 'Lead sincronizado: % - %', NEW."bookingId", NEW."guestName";
    ELSE
      -- Si no es Futura Pendiente, eliminar de leads
      DELETE FROM "Leads" WHERE "bookingId" = NEW."bookingId";
      
      IF FOUND THEN
        RAISE NOTICE 'Lead eliminado (cambio de estado): %', NEW."bookingId";
      END IF;
    END IF;
    
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    -- Si se elimina la booking, eliminar el lead
    DELETE FROM "Leads" WHERE "bookingId" = OLD."bookingId";
    
    IF FOUND THEN
      RAISE NOTICE 'Lead eliminado (booking eliminada): %', OLD."bookingId";
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END $$;

-- 6. APLICAR NUEVA ESTRUCTURA
-- ============================================================
-- Desactivar triggers temporalmente
ALTER TABLE "Booking" DISABLE TRIGGER "trg_Booking_sync_leads";
ALTER TABLE "Booking" DISABLE TRIGGER "trg_Booking_delete_sync_leads";

-- Renombrar tablas
ALTER TABLE "Leads" RENAME TO "Leads_old";
ALTER TABLE "Leads_new" RENAME TO "Leads";

-- 7. RECREAR TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS "trg_Booking_sync_leads" ON "Booking";
DROP TRIGGER IF EXISTS "trg_Booking_delete_sync_leads" ON "Booking";

CREATE TRIGGER "trg_Booking_sync_leads"
AFTER INSERT OR UPDATE OF "BDStatus", "guestName", "propertyName",
                         "arrivalDate", "departureDate", "totalPersons",
                         "channel", "phone", "numNights"
ON "Booking"
FOR EACH ROW
EXECUTE FUNCTION public.booking_sync_leads();

CREATE TRIGGER "trg_Booking_delete_sync_leads"
AFTER DELETE ON "Booking"
FOR EACH ROW
EXECUTE FUNCTION public.booking_sync_leads();

-- 8. SINCRONIZACIÓN INICIAL
-- ============================================================
-- Limpiar tabla
TRUNCATE TABLE "Leads";

-- Re-sincronizar desde Booking
UPDATE "Booking" 
SET "lastUpdatedBD" = "lastUpdatedBD"
WHERE "BDStatus" = 'Futura Pendiente';

-- 9. VERIFICACIÓN FINAL
-- ============================================================
-- Contar leads sincronizados
SELECT COUNT(*) as total_leads FROM "Leads";

-- Mostrar estructura nueva
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'Leads' 
ORDER BY ordinal_position;

-- Mostrar muestra de datos
SELECT 
    "bookingId",
    "guestName",
    "phone",
    "propertyName",
    TO_CHAR("arrivalDate", 'DD/MM/YYYY') as "arrivalDate",
    TO_CHAR("departureDate", 'DD/MM/YYYY') as "departureDate",
    "numNights",
    "totalPersons",
    "channel",
    TO_CHAR("createdAt", 'DD/MM/YYYY HH24:MI') as "createdAt"
FROM "Leads"
ORDER BY "arrivalDate"
LIMIT 10;

-- 10. LIMPIEZA
-- ============================================================
-- Solo ejecutar después de verificar que todo está bien
-- DROP TABLE IF EXISTS "Leads_old";

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================
-- RESUMEN DE CAMBIOS:
-- ✅ Estructura simplificada (10 campos vs 20+)
-- ✅ Fechas como DATE (sin hora)
-- ✅ Índices optimizados
-- ✅ Trigger mejorado con validaciones
-- ✅ Sincronización automática con Booking
-- ============================================================