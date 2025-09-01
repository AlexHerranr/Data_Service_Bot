-- ========================================
-- SCRIPT DE MIGRACIÓN: RENOMBRAR TABLAS A ESPAÑOL
-- Fecha: 2025-01-10
-- ========================================

BEGIN;

-- 1. GUARDAR TRIGGERS EXISTENTES
-- Primero eliminamos los triggers para evitar conflictos durante el renombrado

DROP TRIGGER IF EXISTS sync_booking_to_contactos ON "Booking";
DROP TRIGGER IF EXISTS sync_clientview_to_contactos ON "ClientView";
DROP TRIGGER IF EXISTS sync_booking_to_leads ON "Booking";
DROP TRIGGER IF EXISTS sync_booking_to_ia_crm ON "Booking";
DROP TRIGGER IF EXISTS sync_clientview_to_ia_crm ON "ClientView";

-- 2. RENOMBRAR TABLAS
-- Orden: de menos a más dependencias

-- 2.1 Leads → Oportunidades
ALTER TABLE IF EXISTS "Leads" RENAME TO "Oportunidades";

-- 2.2 hotel_apartments → Propiedades
ALTER TABLE IF EXISTS "hotel_apartments" RENAME TO "Propiedades";

-- 2.3 ClientView → Chats
ALTER TABLE IF EXISTS "ClientView" RENAME TO "Chats";

-- 2.4 IA_CRM_Clientes → CRM
ALTER TABLE IF EXISTS "IA_CRM_Clientes" RENAME TO "CRM";

-- 2.5 Contactos → Clientes
ALTER TABLE IF EXISTS "Contactos" RENAME TO "Clientes";

-- 2.6 Booking → Reservas
ALTER TABLE IF EXISTS "Booking" RENAME TO "Reservas";

-- 3. ACTUALIZAR SECUENCIAS (si es necesario)
-- Las secuencias mantienen su nombre original, pero podemos renombrarlas también

ALTER SEQUENCE IF EXISTS "Leads_id_seq" RENAME TO "Oportunidades_id_seq";
ALTER SEQUENCE IF EXISTS "hotel_apartments_id_seq" RENAME TO "Propiedades_id_seq";
ALTER SEQUENCE IF EXISTS "IA_CRM_Clientes_id_seq" RENAME TO "CRM_id_seq";
ALTER SEQUENCE IF EXISTS "Contactos_id_seq" RENAME TO "Clientes_id_seq";
ALTER SEQUENCE IF EXISTS "Booking_id_seq" RENAME TO "Reservas_id_seq";

-- 4. RECREAR FUNCIONES CON NUEVOS NOMBRES DE TABLA

-- 4.1 Función: Sincronizar Reservas → Clientes
CREATE OR REPLACE FUNCTION sync_reservas_to_clientes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "Clientes" (
    "phoneNumber",
    "name",
    "email",
    "totalBookings",
    "confirmedBookings",
    "pendingBookings",
    "lastCheckIn",
    "nextCheckIn",
    "totalSpent",
    "lastActivity",
    "source",
    "status",
    "hasWhatsapp"
  )
  VALUES (
    NEW."phone",
    NEW."guestName",
    NEW."email",
    1,
    CASE WHEN NEW."BDStatus" IN ('Futura Confirmada', 'New') THEN 1 ELSE 0 END,
    CASE WHEN NEW."BDStatus" = 'Futura Pendiente' THEN 1 ELSE 0 END,
    CASE WHEN NEW."BDStatus" IN ('Futura Confirmada', 'New') THEN NEW."arrivalDate"::date ELSE NULL END,
    CASE WHEN NEW."BDStatus" IN ('Futura Confirmada', 'Futura Pendiente') THEN NEW."arrivalDate"::date ELSE NULL END,
    COALESCE(CAST(REPLACE(REPLACE(NEW."totalCharges", ',', ''), '$', '') AS DECIMAL), 0),
    NOW(),
    ARRAY['reservas', CONCAT('reservas_', LOWER(COALESCE(NEW."channel", 'directo')))],
    'active',
    false
  )
  ON CONFLICT ("phoneNumber") DO UPDATE SET
    "name" = COALESCE(EXCLUDED."name", "Clientes"."name"),
    "email" = COALESCE(EXCLUDED."email", "Clientes"."email"),
    "totalBookings" = "Clientes"."totalBookings" + 1,
    "confirmedBookings" = "Clientes"."confirmedBookings" + EXCLUDED."confirmedBookings",
    "pendingBookings" = "Clientes"."pendingBookings" + EXCLUDED."pendingBookings",
    "lastCheckIn" = GREATEST("Clientes"."lastCheckIn", EXCLUDED."lastCheckIn"),
    "nextCheckIn" = LEAST("Clientes"."nextCheckIn", EXCLUDED."nextCheckIn"),
    "totalSpent" = "Clientes"."totalSpent" + EXCLUDED."totalSpent",
    "lastActivity" = NOW(),
    "source" = ARRAY(
      SELECT DISTINCT unnest(
        "Clientes"."source" || ARRAY['reservas', CONCAT('reservas_', LOWER(COALESCE(NEW."channel", 'directo')))]
      )
    ),
    "updatedAt" = NOW();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4.2 Función: Sincronizar Chats → Clientes
CREATE OR REPLACE FUNCTION sync_chats_to_clientes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "Clientes" (
    "phoneNumber",
    "name",
    "whatsappChatId",
    "whatsappLabels",
    "lastWhatsappMsg",
    "hasWhatsapp",
    "lastActivity",
    "source",
    "status"
  )
  VALUES (
    NEW."phoneNumber",
    COALESCE(NEW."name", NEW."userName"),
    NEW."chatId",
    NEW."labels",
    NEW."lastActivity",
    true,
    NEW."lastActivity",
    ARRAY['whatsapp', 'chats'],
    'active'
  )
  ON CONFLICT ("phoneNumber") DO UPDATE SET
    "name" = COALESCE(EXCLUDED."name", "Clientes"."name"),
    "whatsappChatId" = EXCLUDED."whatsappChatId",
    "whatsappLabels" = EXCLUDED."whatsappLabels",
    "lastWhatsappMsg" = EXCLUDED."lastWhatsappMsg",
    "hasWhatsapp" = true,
    "lastActivity" = EXCLUDED."lastActivity",
    "source" = ARRAY(
      SELECT DISTINCT unnest(
        "Clientes"."source" || ARRAY['whatsapp', 'chats']
      )
    ),
    "updatedAt" = NOW();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4.3 Función: Sincronizar Reservas → Oportunidades
CREATE OR REPLACE FUNCTION sync_reservas_to_oportunidades()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo insertar si es Futura Pendiente
  IF NEW."BDStatus" = 'Futura Pendiente' THEN
    INSERT INTO "Oportunidades" (
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
    VALUES (
      NEW."bookingId",
      NEW."guestName",
      NEW."phone",
      NEW."propertyName",
      NEW."arrivalDate"::date,
      NEW."departureDate"::date,
      NEW."numNights",
      NEW."totalPersons",
      NEW."channel"
    )
    ON CONFLICT ("bookingId") DO UPDATE SET
      "guestName" = EXCLUDED."guestName",
      "phone" = EXCLUDED."phone",
      "propertyName" = EXCLUDED."propertyName",
      "arrivalDate" = EXCLUDED."arrivalDate",
      "departureDate" = EXCLUDED."departureDate";
  ELSE
    -- Si cambió de estado, eliminar de Oportunidades
    DELETE FROM "Oportunidades" WHERE "bookingId" = NEW."bookingId";
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4.4 Función: Sincronizar Reservas → CRM
CREATE OR REPLACE FUNCTION sync_reservas_to_crm()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "CRM" (
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
    "totalValue",
    "lastInteraction"
  )
  VALUES (
    NEW."phone",
    NEW."guestName",
    NEW."email",
    NEW."bookingId",
    NEW."BDStatus",
    'reservas',
    NEW."propertyName",
    NEW."arrivalDate"::date,
    NEW."departureDate"::date,
    1,
    COALESCE(CAST(REPLACE(REPLACE(NEW."totalCharges", ',', ''), '$', '') AS INTEGER), 0),
    NOW()
  )
  ON CONFLICT ("phoneNumber") DO UPDATE SET
    "clientName" = COALESCE(EXCLUDED."clientName", "CRM"."clientName"),
    "email" = COALESCE(EXCLUDED."email", "CRM"."email"),
    "currentStatus" = EXCLUDED."currentStatus",
    "propertyName" = EXCLUDED."propertyName",
    "arrivalDate" = EXCLUDED."arrivalDate",
    "departureDate" = EXCLUDED."departureDate",
    "totalBookings" = "CRM"."totalBookings" + 1,
    "totalValue" = "CRM"."totalValue" + EXCLUDED."totalValue",
    "lastInteraction" = NOW(),
    "updatedAt" = NOW();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4.5 Función: Sincronizar Chats → CRM
CREATE OR REPLACE FUNCTION sync_chats_to_crm()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "CRM" (
    "phoneNumber",
    "clientName",
    "currentStatus",
    "source",
    "threadId",
    "wspLabels",
    "lastInteraction"
  )
  VALUES (
    NEW."phoneNumber",
    COALESCE(NEW."name", NEW."userName"),
    'Contacto WSP',
    'whatsapp',
    NEW."threadId",
    NEW."labels",
    NEW."lastActivity"
  )
  ON CONFLICT ("phoneNumber") DO UPDATE SET
    "clientName" = COALESCE(EXCLUDED."clientName", "CRM"."clientName"),
    "threadId" = EXCLUDED."threadId",
    "wspLabels" = EXCLUDED."wspLabels",
    "lastInteraction" = EXCLUDED."lastInteraction",
    "updatedAt" = NOW();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. RECREAR TRIGGERS CON NUEVOS NOMBRES

-- 5.1 Trigger: Reservas → Clientes
CREATE TRIGGER sync_reservas_to_clientes
AFTER INSERT OR UPDATE ON "Reservas"
FOR EACH ROW
WHEN (NEW."phone" IS NOT NULL)
EXECUTE FUNCTION sync_reservas_to_clientes();

-- 5.2 Trigger: Chats → Clientes
CREATE TRIGGER sync_chats_to_clientes
AFTER INSERT OR UPDATE ON "Chats"
FOR EACH ROW
EXECUTE FUNCTION sync_chats_to_clientes();

-- 5.3 Trigger: Reservas → Oportunidades
CREATE TRIGGER sync_reservas_to_oportunidades
AFTER INSERT OR UPDATE ON "Reservas"
FOR EACH ROW
EXECUTE FUNCTION sync_reservas_to_oportunidades();

-- 5.4 Trigger: Reservas → CRM
CREATE TRIGGER sync_reservas_to_crm
AFTER INSERT OR UPDATE ON "Reservas"
FOR EACH ROW
WHEN (NEW."phone" IS NOT NULL)
EXECUTE FUNCTION sync_reservas_to_crm();

-- 5.5 Trigger: Chats → CRM
CREATE TRIGGER sync_chats_to_crm
AFTER INSERT OR UPDATE ON "Chats"
FOR EACH ROW
EXECUTE FUNCTION sync_chats_to_crm();

-- 6. ACTUALIZAR VISTAS

-- 6.1 Vista de análisis de fuentes
CREATE OR REPLACE VIEW clientes_por_fuente AS
SELECT 
  CASE 
    WHEN 'reservas' = ANY(source) AND 'whatsapp' = ANY(source) THEN 'Reservas + WhatsApp'
    WHEN 'reservas' = ANY(source) THEN 'Solo Reservas'
    WHEN 'whatsapp' = ANY(source) THEN 'Solo WhatsApp'
    WHEN 'imported' = ANY(source) THEN 'Importado Manual'
    ELSE 'Sin Fuente'
  END as tipo_fuente,
  COUNT(*) as total,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "Clientes"), 2) as porcentaje
FROM "Clientes"
GROUP BY tipo_fuente
ORDER BY total DESC;

-- 7. VERIFICACIÓN FINAL
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Verificar que las tablas fueron renombradas
  SELECT COUNT(*) INTO v_count FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name IN ('Reservas', 'Chats', 'Clientes', 'CRM', 'Oportunidades', 'Propiedades');
  
  IF v_count = 6 THEN
    RAISE NOTICE '✅ Todas las tablas fueron renombradas correctamente';
  ELSE
    RAISE EXCEPTION '❌ Error: Solo % tablas fueron renombradas', v_count;
  END IF;
END $$;

COMMIT;

-- 8. CONSULTAS DE VERIFICACIÓN (ejecutar después del commit)

-- Verificar nuevos nombres
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- Verificar triggers
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'sync_%';

-- Contar registros
-- SELECT 'Reservas' as tabla, COUNT(*) as total FROM "Reservas"
-- UNION ALL
-- SELECT 'Chats', COUNT(*) FROM "Chats"
-- UNION ALL
-- SELECT 'Clientes', COUNT(*) FROM "Clientes"
-- UNION ALL
-- SELECT 'CRM', COUNT(*) FROM "CRM"
-- UNION ALL
-- SELECT 'Oportunidades', COUNT(*) FROM "Oportunidades"
-- UNION ALL
-- SELECT 'Propiedades', COUNT(*) FROM "Propiedades";