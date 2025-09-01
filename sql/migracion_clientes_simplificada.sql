-- ========================================
-- MIGRACIÓN: SIMPLIFICAR TABLA CLIENTES
-- Fecha: 2025-01-10
-- De 21 columnas a 11 columnas esenciales
-- ========================================

BEGIN;

-- 1. BACKUP DE SEGURIDAD
CREATE TABLE IF NOT EXISTS "Clientes_backup_20250110_v2" AS 
SELECT * FROM "Clientes";

-- 2. RENOMBRAR TABLA ACTUAL
ALTER TABLE "Clientes" RENAME TO "Clientes_old";

-- 3. CREAR NUEVA TABLA SIMPLIFICADA
CREATE TABLE "Clientes" (
    id SERIAL PRIMARY KEY,
    telefono VARCHAR(50) UNIQUE NOT NULL,
    nombre TEXT,
    email TEXT,
    notas JSONB DEFAULT '{}',
    etiquetas TEXT[] DEFAULT '{}',
    total_reservas INTEGER DEFAULT 0,
    ultima_actividad TIMESTAMP,
    estado TEXT,
    creado_en TIMESTAMP DEFAULT NOW(),
    actualizado_en TIMESTAMP DEFAULT NOW()
);

-- 4. CREAR ÍNDICES
CREATE INDEX idx_clientes_telefono ON "Clientes"(telefono);
CREATE INDEX idx_clientes_estado ON "Clientes"(estado);
CREATE INDEX idx_clientes_ultima_actividad ON "Clientes"(ultima_actividad);

-- 5. MIGRAR DATOS EXISTENTES
INSERT INTO "Clientes" (
    telefono,
    nombre,
    email,
    notas,
    etiquetas,
    total_reservas,
    ultima_actividad,
    estado,
    creado_en,
    actualizado_en
)
SELECT 
    "phoneNumber" as telefono,
    "name" as nombre,
    "email",
    -- Combinar notas existentes en JSON
    jsonb_build_object(
        'importacion', COALESCE("notes", ''),
        'sistema', 'Migrado desde tabla anterior'
    ) as notas,
    -- Convertir whatsappLabels a array
    CASE 
        WHEN "whatsappLabels" IS NOT NULL 
        THEN string_to_array("whatsappLabels", ',')
        ELSE '{}'
    END as etiquetas,
    COALESCE("totalBookings", 0) as total_reservas,
    COALESCE("lastActivity", "updatedAt") as ultima_actividad,
    COALESCE("status", 'activo') as estado,
    "createdAt" as creado_en,
    "updatedAt" as actualizado_en
FROM "Clientes_old";

-- 6. FUNCIÓN PARA ACTUALIZAR NOTAS DESDE MÚLTIPLES FUENTES
CREATE OR REPLACE FUNCTION actualizar_notas_cliente()
RETURNS TRIGGER AS $$
DECLARE
    v_notas_actuales JSONB;
BEGIN
    -- Obtener notas actuales
    SELECT COALESCE(notas, '{}')::jsonb INTO v_notas_actuales
    FROM "Clientes" 
    WHERE telefono = NEW.phone;
    
    -- Actualizar según la tabla de origen
    IF TG_TABLE_NAME = 'Reservas' THEN
        -- Agregar notas de Reservas
        IF NEW.notes IS NOT NULL THEN
            v_notas_actuales = jsonb_set(v_notas_actuales, '{reservas_notes}', to_jsonb(NEW.notes));
        END IF;
        IF NEW."internalNotes" IS NOT NULL THEN
            v_notas_actuales = jsonb_set(v_notas_actuales, '{reservas_internal}', to_jsonb(NEW."internalNotes"));
        END IF;
        
        -- Actualizar cliente
        UPDATE "Clientes" 
        SET 
            notas = v_notas_actuales,
            ultima_actividad = GREATEST(ultima_actividad, NEW."modifiedDate"::timestamp, NEW."lastUpdatedBD"),
            estado = COALESCE(NEW."BDStatus", estado),
            actualizado_en = NOW()
        WHERE telefono = NEW.phone;
        
    ELSIF TG_TABLE_NAME = 'CRM' THEN
        -- Agregar notas de CRM
        IF NEW."proximaAccion" IS NOT NULL THEN
            v_notas_actuales = jsonb_set(v_notas_actuales, '{crm_proxima_accion}', to_jsonb(NEW."proximaAccion"));
        END IF;
        IF NEW."internalNotes" IS NOT NULL THEN
            v_notas_actuales = jsonb_set(v_notas_actuales, '{crm_internal}', to_jsonb(NEW."internalNotes"));
        END IF;
        
        UPDATE "Clientes" 
        SET 
            notas = v_notas_actuales,
            actualizado_en = NOW()
        WHERE telefono = NEW."phoneNumber";
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. FUNCIÓN PARA CALCULAR TOTAL DE RESERVAS
CREATE OR REPLACE FUNCTION actualizar_total_reservas()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE "Clientes" 
    SET total_reservas = (
        SELECT COUNT(*) 
        FROM "Reservas" 
        WHERE phone = NEW.phone
    )
    WHERE telefono = NEW.phone;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. FUNCIÓN PARA ACTUALIZAR ÚLTIMA ACTIVIDAD
CREATE OR REPLACE FUNCTION actualizar_ultima_actividad()
RETURNS TRIGGER AS $$
DECLARE
    v_ultima_actividad TIMESTAMP;
BEGIN
    -- Calcular la actividad más reciente
    SELECT GREATEST(
        (SELECT MAX("modifiedDate"::timestamp) FROM "Reservas" WHERE phone = NEW."phoneNumber"),
        (SELECT MAX("lastActivity") FROM "Chats" WHERE "phoneNumber" = NEW."phoneNumber"),
        NOW()
    ) INTO v_ultima_actividad;
    
    UPDATE "Clientes" 
    SET 
        ultima_actividad = v_ultima_actividad,
        actualizado_en = NOW()
    WHERE telefono = NEW."phoneNumber";
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. RECREAR TRIGGERS PRINCIPALES

-- Trigger para Reservas -> Clientes
DROP TRIGGER IF EXISTS sync_reservas_to_clientes ON "Reservas";
CREATE TRIGGER sync_reservas_to_clientes_v2
AFTER INSERT OR UPDATE ON "Reservas"
FOR EACH ROW
WHEN (NEW.phone IS NOT NULL)
EXECUTE FUNCTION actualizar_notas_cliente();

-- Trigger para contar reservas
CREATE TRIGGER actualizar_contador_reservas
AFTER INSERT OR UPDATE OR DELETE ON "Reservas"
FOR EACH ROW
WHEN (NEW.phone IS NOT NULL OR OLD.phone IS NOT NULL)
EXECUTE FUNCTION actualizar_total_reservas();

-- Trigger para CRM -> Clientes
DROP TRIGGER IF EXISTS sync_crm_to_clientes ON "CRM";
CREATE TRIGGER sync_crm_to_clientes_v2
AFTER INSERT OR UPDATE ON "CRM"
FOR EACH ROW
WHEN (NEW."phoneNumber" IS NOT NULL)
EXECUTE FUNCTION actualizar_notas_cliente();

-- Trigger para Chats -> Clientes
DROP TRIGGER IF EXISTS sync_chats_to_clientes ON "Chats";
CREATE TRIGGER sync_chats_to_clientes_v2
AFTER INSERT OR UPDATE ON "Chats"
FOR EACH ROW
EXECUTE FUNCTION actualizar_ultima_actividad();

-- 10. ELIMINAR TABLA VIEJA (después de verificar)
-- DROP TABLE "Clientes_old"; -- Ejecutar manualmente después de verificar

-- 11. VERIFICACIÓN
DO $$
DECLARE
    v_count_old INTEGER;
    v_count_new INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count_old FROM "Clientes_old";
    SELECT COUNT(*) INTO v_count_new FROM "Clientes";
    
    RAISE NOTICE 'Registros migrados: % de %', v_count_new, v_count_old;
    
    IF v_count_new = v_count_old THEN
        RAISE NOTICE '✅ Migración completada exitosamente';
    ELSE
        RAISE WARNING '⚠️ Diferencia en cantidad de registros';
    END IF;
END $$;

COMMIT;

-- VERIFICACIÓN POST-MIGRACIÓN
-- SELECT 
--     telefono,
--     nombre,
--     jsonb_pretty(notas) as notas_formateadas,
--     etiquetas,
--     total_reservas,
--     ultima_actividad,
--     estado
-- FROM "Clientes" 
-- LIMIT 5;