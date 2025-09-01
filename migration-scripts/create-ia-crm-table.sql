-- ============================================================
-- CREACIÓN DE TABLA IA_CRM_Clientes
-- Sistema CRM unificado para seguimiento inteligente
-- ============================================================

-- 1. ELIMINAR TABLA SI EXISTE (para fresh start)
DROP TABLE IF EXISTS "IA_CRM_Clientes" CASCADE;

-- 2. CREAR TABLA OPTIMIZADA
CREATE TABLE "IA_CRM_Clientes" (
    -- IDENTIFICACIÓN BÁSICA
    "id" SERIAL PRIMARY KEY,
    "phoneNumber" VARCHAR(50) UNIQUE NOT NULL,     -- Clave única de unificación
    "clientName" VARCHAR(255),                     -- Nombre del cliente
    "email" VARCHAR(255),                          -- Email si disponible
    "bookingId" VARCHAR(255),                      -- Reserva actual (si tiene)
    
    -- ESTADO Y ORIGEN
    "currentStatus" VARCHAR(50),                   -- 'lead', 'confirmado', 'hospedado', 'completado', 'cancelado', 'prospecto'
    "source" VARCHAR(50),                          -- 'whatsapp', 'booking', 'direct', 'airbnb'
    
    -- CAMPOS IA (Los 4 campos clave)
    "profileStatus" TEXT,                          -- Resumen del cliente generado por IA
    "proximaAccion" VARCHAR(255),                  -- Siguiente acción a realizar
    "fechaProximaAccion" TIMESTAMP,                -- Cuándo ejecutar la acción
    "prioridad" INTEGER DEFAULT 3 CHECK (prioridad BETWEEN 1 AND 5), -- 1=urgente, 5=baja
    
    -- CONTEXTO DE RESERVA
    "propertyName" VARCHAR(255),                   -- Propiedad (si tiene reserva)
    "arrivalDate" DATE,                            -- Fecha llegada (si tiene reserva)
    "departureDate" DATE,                          -- Fecha salida (si tiene reserva)
    
    -- INTERACCIONES
    "lastInteraction" TIMESTAMP,                   -- Última interacción
    "lastWhatsappMessage" TEXT,                    -- Último mensaje de WhatsApp
    "threadId" VARCHAR(255),                       -- Thread de WhatsApp (de ClientView)
    
    -- MÉTRICAS
    "totalBookings" INTEGER DEFAULT 0,             -- Total histórico de reservas
    "totalValue" DECIMAL(10,2) DEFAULT 0,          -- Valor total histórico
    "tags" TEXT[],                                 -- Etiquetas: ['vip', 'problema', 'frecuente']
    
    -- CONTROL
    "automationEnabled" BOOLEAN DEFAULT true,      -- Permite automatización
    "notes" TEXT,                                  -- Notas manuales
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- 3. CREAR ÍNDICES OPTIMIZADOS
CREATE INDEX idx_ia_crm_phone ON "IA_CRM_Clientes" ("phoneNumber");
CREATE INDEX idx_ia_crm_proxima_accion ON "IA_CRM_Clientes" ("fechaProximaAccion", "prioridad");
CREATE INDEX idx_ia_crm_status ON "IA_CRM_Clientes" ("currentStatus");
CREATE INDEX idx_ia_crm_booking ON "IA_CRM_Clientes" ("bookingId");

-- 4. FUNCIÓN DE SINCRONIZACIÓN DESDE BOOKING
CREATE OR REPLACE FUNCTION sync_crm_from_booking()
RETURNS TRIGGER AS $$
DECLARE
    v_total_bookings INTEGER;
    v_total_value DECIMAL;
    v_status VARCHAR(50);
BEGIN
    -- Determinar el status basado en BDStatus
    v_status := CASE 
        WHEN NEW."BDStatus" = 'Futura Pendiente' THEN 'lead'
        WHEN NEW."BDStatus" = 'Futura Confirmada' THEN 'confirmado'
        WHEN NEW."BDStatus" IN ('Pasada Confirmada', 'Pasada Pendiente') THEN 'completado'
        WHEN NEW."BDStatus" LIKE '%Cancelada%' THEN 'cancelado'
        WHEN NEW."arrivalDate"::date = CURRENT_DATE THEN 'hospedado'
        ELSE 'prospecto'
    END;
    
    -- Calcular métricas históricas
    SELECT 
        COUNT(*),
        COALESCE(SUM(CAST(NULLIF(b."totalCharges", '') AS DECIMAL)), 0)
    INTO v_total_bookings, v_total_value
    FROM "Booking" b
    WHERE b."phone" = NEW."phone"
      AND b."BDStatus" NOT LIKE '%Cancelada%';
    
    -- Insertar o actualizar en CRM
    INSERT INTO "IA_CRM_Clientes" (
        "phoneNumber",
        "clientName",
        "email",
        "bookingId",
        "currentStatus",
        "source",
        "propertyName",
        "arrivalDate",
        "departureDate",
        "lastInteraction",
        "totalBookings",
        "totalValue"
    )
    VALUES (
        COALESCE(NEW."phone", 'unknown-' || NEW."bookingId"),
        NEW."guestName",
        NEW."email",
        NEW."bookingId",
        v_status,
        COALESCE(NEW."channel", 'direct'),
        NEW."propertyName",
        NEW."arrivalDate"::date,
        NEW."departureDate"::date,
        NOW(),
        v_total_bookings,
        v_total_value
    )
    ON CONFLICT ("phoneNumber") DO UPDATE SET
        -- Solo actualizar si la nueva reserva NO está cancelada o si no hay reserva activa
        "bookingId" = CASE 
            WHEN v_status != 'cancelado' THEN EXCLUDED."bookingId"
            WHEN "IA_CRM_Clientes"."currentStatus" = 'cancelado' THEN EXCLUDED."bookingId"
            ELSE "IA_CRM_Clientes"."bookingId"
        END,
        "clientName" = COALESCE(EXCLUDED."clientName", "IA_CRM_Clientes"."clientName"),
        "email" = COALESCE(EXCLUDED."email", "IA_CRM_Clientes"."email"),
        "currentStatus" = CASE 
            WHEN v_status != 'cancelado' THEN v_status
            WHEN "IA_CRM_Clientes"."currentStatus" = 'cancelado' THEN v_status
            ELSE "IA_CRM_Clientes"."currentStatus"
        END,
        "propertyName" = CASE 
            WHEN v_status != 'cancelado' THEN EXCLUDED."propertyName"
            ELSE "IA_CRM_Clientes"."propertyName"
        END,
        "arrivalDate" = CASE 
            WHEN v_status != 'cancelado' THEN EXCLUDED."arrivalDate"
            ELSE "IA_CRM_Clientes"."arrivalDate"
        END,
        "departureDate" = CASE 
            WHEN v_status != 'cancelado' THEN EXCLUDED."departureDate"
            ELSE "IA_CRM_Clientes"."departureDate"
        END,
        "lastInteraction" = NOW(),
        "totalBookings" = EXCLUDED."totalBookings",
        "totalValue" = EXCLUDED."totalValue",
        "updatedAt" = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. FUNCIÓN DE SINCRONIZACIÓN DESDE CLIENTVIEW (WHATSAPP)
CREATE OR REPLACE FUNCTION sync_crm_from_whatsapp()
RETURNS TRIGGER AS $$
DECLARE
    v_has_active_booking BOOLEAN;
    v_booking_status VARCHAR(50);
BEGIN
    -- Verificar si tiene reserva activa (no cancelada)
    SELECT 
        EXISTS(
            SELECT 1 FROM "Booking" 
            WHERE "phone" = NEW."phoneNumber" 
            AND "BDStatus" NOT LIKE '%Cancelada%'
            AND "BDStatus" IS NOT NULL
        ),
        (SELECT "BDStatus" FROM "Booking" 
         WHERE "phone" = NEW."phoneNumber" 
         ORDER BY "lastUpdatedBD" DESC 
         LIMIT 1)
    INTO v_has_active_booking, v_booking_status;
    
    -- Solo crear/actualizar si NO tiene reserva activa o si todas están canceladas
    IF NOT v_has_active_booking OR v_booking_status LIKE '%Cancelada%' OR v_booking_status IS NULL THEN
        INSERT INTO "IA_CRM_Clientes" (
            "phoneNumber",
            "clientName",
            "currentStatus",
            "source",
            "lastInteraction",
            "threadId",
            "profileStatus",
            "proximaAccion",
            "fechaProximaAccion",
            "prioridad"
        )
        VALUES (
            NEW."phoneNumber",
            COALESCE(NEW."name", NEW."userName", 'Cliente WhatsApp'),
            'prospecto',
            'whatsapp',
            COALESCE(NEW."lastActivity", NOW()),
            NEW."threadId",
            NEW."profileStatus",
            NEW."proximaAccion",
            NEW."fechaProximaAccion",
            COALESCE(NEW."prioridad", 3)
        )
        ON CONFLICT ("phoneNumber") DO UPDATE SET
            "clientName" = COALESCE(EXCLUDED."clientName", "IA_CRM_Clientes"."clientName"),
            "lastInteraction" = EXCLUDED."lastInteraction",
            "threadId" = EXCLUDED."threadId",
            "profileStatus" = COALESCE(EXCLUDED."profileStatus", "IA_CRM_Clientes"."profileStatus"),
            "proximaAccion" = COALESCE(EXCLUDED."proximaAccion", "IA_CRM_Clientes"."proximaAccion"),
            "fechaProximaAccion" = COALESCE(EXCLUDED."fechaProximaAccion", "IA_CRM_Clientes"."fechaProximaAccion"),
            "prioridad" = COALESCE(EXCLUDED."prioridad", "IA_CRM_Clientes"."prioridad"),
            "updatedAt" = NOW()
        WHERE 
            -- Solo actualizar si no tiene reserva activa
            "IA_CRM_Clientes"."currentStatus" IN ('prospecto', 'cancelado')
            OR "IA_CRM_Clientes"."currentStatus" IS NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. CREAR TRIGGERS
DROP TRIGGER IF EXISTS trg_booking_to_crm ON "Booking";
CREATE TRIGGER trg_booking_to_crm
    AFTER INSERT OR UPDATE ON "Booking"
    FOR EACH ROW
    EXECUTE FUNCTION sync_crm_from_booking();

DROP TRIGGER IF EXISTS trg_whatsapp_to_crm ON "ClientView";
CREATE TRIGGER trg_whatsapp_to_crm
    AFTER INSERT OR UPDATE ON "ClientView"
    FOR EACH ROW
    EXECUTE FUNCTION sync_crm_from_whatsapp();

-- 7. SINCRONIZACIÓN INICIAL

-- Primero: Sincronizar todas las reservas de Booking
INSERT INTO "IA_CRM_Clientes" (
    "phoneNumber",
    "clientName",
    "email",
    "bookingId",
    "currentStatus",
    "source",
    "propertyName",
    "arrivalDate",
    "departureDate",
    "totalBookings",
    "totalValue"
)
SELECT DISTINCT ON (b."phone")
    COALESCE(b."phone", 'unknown-' || b."bookingId"),
    b."guestName",
    b."email",
    b."bookingId",
    CASE 
        WHEN b."BDStatus" = 'Futura Pendiente' THEN 'lead'
        WHEN b."BDStatus" = 'Futura Confirmada' THEN 'confirmado'
        WHEN b."BDStatus" IN ('Pasada Confirmada', 'Pasada Pendiente') THEN 'completado'
        WHEN b."BDStatus" LIKE '%Cancelada%' THEN 'cancelado'
        WHEN b."arrivalDate"::date = CURRENT_DATE THEN 'hospedado'
        ELSE 'prospecto'
    END,
    COALESCE(b."channel", 'direct'),
    b."propertyName",
    b."arrivalDate"::date,
    b."departureDate"::date,
    (SELECT COUNT(*) FROM "Booking" WHERE "phone" = b."phone" AND "BDStatus" NOT LIKE '%Cancelada%'),
    (SELECT COALESCE(SUM(CAST(NULLIF("totalCharges", '') AS DECIMAL)), 0) 
     FROM "Booking" WHERE "phone" = b."phone" AND "BDStatus" NOT LIKE '%Cancelada%')
FROM "Booking" b
WHERE b."phone" IS NOT NULL 
  AND b."phone" != ''
  AND b."BDStatus" NOT LIKE '%Cancelada%'
ORDER BY b."phone", b."lastUpdatedBD" DESC
ON CONFLICT ("phoneNumber") DO NOTHING;

-- Segundo: Sincronizar ClientView (solo los que NO tienen reserva activa)
INSERT INTO "IA_CRM_Clientes" (
    "phoneNumber",
    "clientName",
    "currentStatus",
    "source",
    "threadId",
    "profileStatus",
    "proximaAccion",
    "fechaProximaAccion",
    "prioridad"
)
SELECT 
    cv."phoneNumber",
    COALESCE(cv."name", cv."userName", 'Cliente WhatsApp'),
    'prospecto',
    'whatsapp',
    cv."threadId",
    cv."profileStatus",
    cv."proximaAccion",
    cv."fechaProximaAccion",
    COALESCE(cv."prioridad", 3)
FROM "ClientView" cv
WHERE NOT EXISTS (
    SELECT 1 FROM "Booking" b 
    WHERE b."phone" = cv."phoneNumber" 
    AND b."BDStatus" NOT LIKE '%Cancelada%'
)
ON CONFLICT ("phoneNumber") DO NOTHING;

-- 8. VERIFICACIÓN
SELECT 
    'Total registros CRM' as metrica,
    COUNT(*) as valor
FROM "IA_CRM_Clientes"
UNION ALL
SELECT 
    'Leads (Futura Pendiente)',
    COUNT(*)
FROM "IA_CRM_Clientes"
WHERE "currentStatus" = 'lead'
UNION ALL
SELECT 
    'Confirmados',
    COUNT(*)
FROM "IA_CRM_Clientes"
WHERE "currentStatus" = 'confirmado'
UNION ALL
SELECT 
    'Prospectos WhatsApp',
    COUNT(*)
FROM "IA_CRM_Clientes"
WHERE "currentStatus" = 'prospecto' AND "source" = 'whatsapp'
UNION ALL
SELECT 
    'Cancelados',
    COUNT(*)
FROM "IA_CRM_Clientes"
WHERE "currentStatus" = 'cancelado';

-- ============================================================
-- FIN - TABLA IA_CRM_Clientes CREADA Y SINCRONIZADA
-- ============================================================