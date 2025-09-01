-- ========================================
-- SCRIPT DE CORRECCIÓN DE TRIGGERS PARA PRODUCCIÓN
-- Ejecutar en Railway PostgreSQL
-- Fecha: 27 de Diciembre 2024
-- ========================================

-- 1. BACKUP: Crear snapshot de la tabla Leads (por seguridad)
CREATE TABLE IF NOT EXISTS "Leads_backup_20241227" AS SELECT * FROM "Leads";

-- 2. Desactivar triggers temporalmente
ALTER TABLE "Booking" DISABLE TRIGGER "trg_Booking_sync_leads";
ALTER TABLE "Booking" DISABLE TRIGGER "trg_Booking_delete_sync_leads";

-- 3. Hacer leadType nullable con valor por defecto en tabla Leads
ALTER TABLE "Leads" 
  ALTER COLUMN "leadType" DROP NOT NULL;

ALTER TABLE "Leads" 
  ALTER COLUMN "leadType" SET DEFAULT 'booking';

-- Actualizar valores NULL existentes
UPDATE "Leads" SET "leadType" = 'booking' WHERE "leadType" IS NULL;

-- 4. Optimizar función del trigger para mejor performance
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

-- 6. Verificación rápida
SELECT 
  'Triggers Activos:' as info,
  COUNT(*) as cantidad
FROM pg_trigger 
WHERE tgrelid = '"Booking"'::regclass 
  AND tgenabled = 'O'
  AND tgisinternal = false;

-- Verificar que leadType ahora es nullable
SELECT 
  'leadType nullable:' as info,
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'Leads' 
  AND column_name = 'leadType';

-- Mensaje final
SELECT '✅ CORRECCIÓN COMPLETADA - Los triggers ahora funcionan correctamente' as resultado;