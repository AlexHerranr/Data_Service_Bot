-- ========================================
-- TRIGGERS PARA SINCRONIZACIÓN AUTOMÁTICA
-- Tabla: Clientes
-- Fecha: 2025-01-10
-- ========================================

BEGIN;

-- ========================================
-- 1. FUNCIÓN: SINCRONIZAR DESDE RESERVAS
-- ========================================

CREATE OR REPLACE FUNCTION sync_reservas_to_clientes()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo procesar si hay teléfono
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    RETURN NEW;
  END IF;

  -- UPSERT en Clientes
  INSERT INTO "Clientes" (
    telefono,
    nombre,
    email,
    estado,
    total_reservas,
    ultima_actividad,
    notas,
    creado_en,
    actualizado_en
  )
  VALUES (
    NEW.phone,
    NEW."guestName",
    NEW.email,
    NEW."BDStatus",
    1, -- Se recalculará después
    GREATEST(NEW."modifiedDate"::timestamp, NEW."lastUpdatedBD"),
    CASE 
      WHEN NEW.notes IS NOT NULL OR NEW."internalNotes" IS NOT NULL
      THEN jsonb_build_object(
        'reservas_notes', COALESCE(NEW.notes, ''),
        'reservas_internal', COALESCE(NEW."internalNotes", '')
      )
      ELSE '{}'::jsonb
    END,
    NOW(),
    NOW()
  )
  ON CONFLICT (telefono) DO UPDATE SET
    -- Actualizar solo si el nombre está más completo
    nombre = CASE 
      WHEN "Clientes".nombre IS NULL OR "Clientes".nombre = ''
      THEN EXCLUDED.nombre
      ELSE "Clientes".nombre
    END,
    -- Email: tomar el más reciente si no hay
    email = COALESCE("Clientes".email, EXCLUDED.email),
    -- Estado: siempre actualizar con el de Reservas
    estado = EXCLUDED.estado,
    -- Última actividad: tomar la más reciente
    ultima_actividad = GREATEST(
      "Clientes".ultima_actividad, 
      EXCLUDED.ultima_actividad
    ),
    -- Agregar notas sin sobrescribir
    notas = CASE
      WHEN NEW.notes IS NOT NULL OR NEW."internalNotes" IS NOT NULL
      THEN "Clientes".notas || jsonb_build_object(
        'reservas_notes', COALESCE(NEW.notes, ''),
        'reservas_internal', COALESCE(NEW."internalNotes", '')
      )
      ELSE "Clientes".notas
    END,
    actualizado_en = NOW();

  -- Recalcular total de reservas
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

-- ========================================
-- 2. FUNCIÓN: SINCRONIZAR DESDE CHATS
-- ========================================

CREATE OR REPLACE FUNCTION sync_chats_to_clientes()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo procesar si hay teléfono
  IF NEW."phoneNumber" IS NULL OR NEW."phoneNumber" = '' THEN
    RETURN NEW;
  END IF;

  -- UPSERT en Clientes
  INSERT INTO "Clientes" (
    telefono,
    nombre,
    etiquetas,
    ultima_actividad,
    creado_en,
    actualizado_en
  )
  VALUES (
    NEW."phoneNumber",
    COALESCE(NEW.name, NEW."userName"),
    CASE 
      WHEN NEW.labels IS NOT NULL 
      THEN string_to_array(NEW.labels, ',')
      ELSE '{}'
    END,
    NEW."lastActivity",
    NOW(),
    NOW()
  )
  ON CONFLICT (telefono) DO UPDATE SET
    -- Nombre: solo actualizar si no hay
    nombre = CASE 
      WHEN "Clientes".nombre IS NULL OR "Clientes".nombre = ''
      THEN COALESCE(EXCLUDED.nombre, "Clientes".nombre)
      ELSE "Clientes".nombre
    END,
    -- Etiquetas: siempre actualizar con las de WhatsApp
    etiquetas = CASE 
      WHEN NEW.labels IS NOT NULL 
      THEN string_to_array(NEW.labels, ',')
      ELSE "Clientes".etiquetas
    END,
    -- Última actividad: tomar la más reciente
    ultima_actividad = GREATEST(
      "Clientes".ultima_actividad, 
      EXCLUDED.ultima_actividad
    ),
    actualizado_en = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 3. FUNCIÓN: ACTUALIZAR AL ELIMINAR RESERVA
-- ========================================

CREATE OR REPLACE FUNCTION update_clientes_on_delete_reserva()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalcular total de reservas
  UPDATE "Clientes" 
  SET 
    total_reservas = (
      SELECT COUNT(*) 
      FROM "Reservas" 
      WHERE phone = OLD.phone
    ),
    -- Si no quedan reservas, limpiar estado
    estado = CASE
      WHEN (SELECT COUNT(*) FROM "Reservas" WHERE phone = OLD.phone) = 0
      THEN NULL
      ELSE (
        SELECT "BDStatus" 
        FROM "Reservas" 
        WHERE phone = OLD.phone 
        ORDER BY "modifiedDate" DESC 
        LIMIT 1
      )
    END,
    actualizado_en = NOW()
  WHERE telefono = OLD.phone;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 4. CREAR TRIGGERS
-- ========================================

-- Trigger para Reservas INSERT/UPDATE
DROP TRIGGER IF EXISTS sync_reservas_to_clientes_insert ON "Reservas";
CREATE TRIGGER sync_reservas_to_clientes_insert
AFTER INSERT OR UPDATE ON "Reservas"
FOR EACH ROW
EXECUTE FUNCTION sync_reservas_to_clientes();

-- Trigger para Reservas DELETE
DROP TRIGGER IF EXISTS sync_reservas_to_clientes_delete ON "Reservas";
CREATE TRIGGER sync_reservas_to_clientes_delete
AFTER DELETE ON "Reservas"
FOR EACH ROW
EXECUTE FUNCTION update_clientes_on_delete_reserva();

-- Trigger para Chats
DROP TRIGGER IF EXISTS sync_chats_to_clientes ON "Chats";
CREATE TRIGGER sync_chats_to_clientes
AFTER INSERT OR UPDATE ON "Chats"
FOR EACH ROW
EXECUTE FUNCTION sync_chats_to_clientes();

-- ========================================
-- 5. VERIFICACIÓN
-- ========================================

-- Verificar triggers creados
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as tabla,
  CASE 
    WHEN tgtype & 4 = 4 THEN 'INSERT'
    WHEN tgtype & 8 = 8 THEN 'DELETE'
    WHEN tgtype & 16 = 16 THEN 'UPDATE'
    WHEN tgtype & 20 = 20 THEN 'INSERT/UPDATE'
    ELSE 'OTRO'
  END as evento
FROM pg_trigger 
WHERE NOT tgisinternal
AND tgrelid::regclass::text IN ('"Reservas"', '"Chats"', '"Clientes"')
ORDER BY tabla, trigger_name;

COMMIT;

-- ========================================
-- RESUMEN DE TRIGGERS CREADOS:
-- 1. sync_reservas_to_clientes_insert - INSERT/UPDATE en Reservas
-- 2. sync_reservas_to_clientes_delete - DELETE en Reservas
-- 3. sync_chats_to_clientes - INSERT/UPDATE en Chats
-- ========================================