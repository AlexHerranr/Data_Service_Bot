-- ============================================================
-- RESET SIMPLE DE TABLA LEADS
-- Borra todo y crea estructura nueva optimizada
-- ============================================================

-- 1. ELIMINAR TABLA ANTIGUA COMPLETAMENTE
-- ============================================================
DROP TABLE IF EXISTS "Leads" CASCADE;

-- 2. CREAR TABLA NUEVA OPTIMIZADA (Solo 10 campos esenciales)
-- ============================================================
CREATE TABLE "Leads" (
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
CREATE INDEX "idx_Leads_arrivalDate" ON "Leads"("arrivalDate");
CREATE INDEX "idx_Leads_phone" ON "Leads"("phone");
CREATE INDEX "idx_Leads_channel" ON "Leads"("channel");
CREATE INDEX "idx_Leads_propertyName_arrivalDate" ON "Leads"("propertyName", "arrivalDate");

-- 4. CREAR FUNCIÓN DE SINCRONIZACIÓN AUTOMÁTICA
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
        GREATEST(1, EXTRACT(DAY FROM (NEW."departureDate"::date - NEW."arrivalDate"::date))),
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
        
    ELSE
      -- Si no es Futura Pendiente, eliminar de leads si existe
      DELETE FROM "Leads" WHERE "bookingId" = NEW."bookingId";
    END IF;
    
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    -- Si se elimina la booking, eliminar el lead
    DELETE FROM "Leads" WHERE "bookingId" = OLD."bookingId";
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END $$;

-- 5. CREAR TRIGGERS PARA SINCRONIZACIÓN AUTOMÁTICA
-- ============================================================
-- Eliminar triggers antiguos si existen
DROP TRIGGER IF EXISTS "trg_Booking_sync_leads" ON "Booking";
DROP TRIGGER IF EXISTS "trg_Booking_delete_sync_leads" ON "Booking";

-- Trigger para INSERT y UPDATE
CREATE TRIGGER "trg_Booking_sync_leads"
AFTER INSERT OR UPDATE OF "BDStatus", "guestName", "propertyName",
                         "arrivalDate", "departureDate", "totalPersons",
                         "channel", "phone", "numNights"
ON "Booking"
FOR EACH ROW
EXECUTE FUNCTION public.booking_sync_leads();

-- Trigger para DELETE
CREATE TRIGGER "trg_Booking_delete_sync_leads"
AFTER DELETE ON "Booking"
FOR EACH ROW
EXECUTE FUNCTION public.booking_sync_leads();

-- 6. SINCRONIZAR TODAS LAS "FUTURA PENDIENTE" EXISTENTES
-- ============================================================
-- Insertar todas las reservas con BDStatus = 'Futura Pendiente'
INSERT INTO "Leads" (
    "bookingId", 
    "guestName", 
    "phone", 
    "propertyName",
    "arrivalDate", 
    "departureDate", 
    "numNights", 
    "totalPersons", 
    "channel"
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
        GREATEST(1, EXTRACT(DAY FROM ("departureDate"::date - "arrivalDate"::date))),
        1
    ),
    COALESCE("totalPersons", 1),
    COALESCE("channel", 'Direct')
FROM "Booking"
WHERE "BDStatus" = 'Futura Pendiente'
  AND "bookingId" IS NOT NULL;

-- 7. MOSTRAR RESULTADOS
-- ============================================================
-- Contar cuántos leads se crearon
SELECT COUNT(*) as "Total Leads Creados" FROM "Leads";

-- Mostrar primeros 10 leads
SELECT 
    "bookingId",
    "guestName",
    "phone",
    "propertyName",
    TO_CHAR("arrivalDate", 'DD/MM/YYYY') as "Llegada",
    "numNights" as "Noches",
    "totalPersons" as "Personas",
    "channel" as "Canal"
FROM "Leads"
ORDER BY "arrivalDate"
LIMIT 10;

-- ============================================================
-- FIN - TABLA LEADS LISTA Y SINCRONIZADA
-- ============================================================