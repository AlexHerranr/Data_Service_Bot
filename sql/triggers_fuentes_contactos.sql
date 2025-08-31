-- Triggers actualizados para gestionar fuentes en la tabla Contactos

-- 1. Trigger para sincronizar desde Booking a Contactos
CREATE OR REPLACE FUNCTION sync_booking_to_contactos_with_source()
RETURNS TRIGGER AS $$
BEGIN
  -- Insertar o actualizar en Contactos con la fuente correcta
  INSERT INTO "Contactos" (
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
    COALESCE(CAST(REPLACE(NEW."totalCharges", ',', '') AS DECIMAL), 0),
    NOW(),
    ARRAY['booking', CONCAT('booking_', LOWER(COALESCE(NEW."channel", 'direct'))), CONCAT('import_', TO_CHAR(NOW(), 'YYYY-MM-DD'))],
    'active',
    false -- Se actualizará después si tiene WhatsApp
  )
  ON CONFLICT ("phoneNumber") DO UPDATE SET
    "name" = COALESCE(EXCLUDED."name", "Contactos"."name"),
    "email" = COALESCE(EXCLUDED."email", "Contactos"."email"),
    "totalBookings" = "Contactos"."totalBookings" + 1,
    "confirmedBookings" = "Contactos"."confirmedBookings" + EXCLUDED."confirmedBookings",
    "pendingBookings" = "Contactos"."pendingBookings" + EXCLUDED."pendingBookings",
    "lastCheckIn" = GREATEST("Contactos"."lastCheckIn", EXCLUDED."lastCheckIn"),
    "nextCheckIn" = LEAST("Contactos"."nextCheckIn", EXCLUDED."nextCheckIn"),
    "totalSpent" = "Contactos"."totalSpent" + EXCLUDED."totalSpent",
    "lastActivity" = NOW(),
    "source" = ARRAY(
      SELECT DISTINCT unnest(
        "Contactos"."source" || ARRAY['booking', CONCAT('booking_', LOWER(COALESCE(NEW."channel", 'direct')))]
      )
    ),
    "updatedAt" = NOW();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger para sincronizar desde ClientView a Contactos
CREATE OR REPLACE FUNCTION sync_clientview_to_contactos_with_source()
RETURNS TRIGGER AS $$
BEGIN
  -- Insertar o actualizar en Contactos con fuente WhatsApp
  INSERT INTO "Contactos" (
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
    ARRAY['whatsapp', 'clientview', CONCAT('sync_', TO_CHAR(NOW(), 'YYYY-MM-DD'))],
    'active'
  )
  ON CONFLICT ("phoneNumber") DO UPDATE SET
    "name" = COALESCE(EXCLUDED."name", "Contactos"."name"),
    "whatsappChatId" = EXCLUDED."whatsappChatId",
    "whatsappLabels" = EXCLUDED."whatsappLabels",
    "lastWhatsappMsg" = EXCLUDED."lastWhatsappMsg",
    "hasWhatsapp" = true,
    "lastActivity" = EXCLUDED."lastActivity",
    "source" = ARRAY(
      SELECT DISTINCT unnest(
        "Contactos"."source" || ARRAY['whatsapp', 'clientview']
      )
    ),
    "updatedAt" = NOW();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Función para importar desde Google Contacts
CREATE OR REPLACE FUNCTION import_google_contact(
  p_phone VARCHAR,
  p_name VARCHAR,
  p_email VARCHAR DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO "Contactos" (
    "phoneNumber",
    "name",
    "email",
    "source",
    "status",
    "hasWhatsapp",
    "lastActivity"
  )
  VALUES (
    p_phone,
    p_name,
    p_email,
    ARRAY['google_contacts', CONCAT('google_import_', TO_CHAR(NOW(), 'YYYY-MM-DD'))],
    'active',
    false, -- Se verificará después con Whapi
    NOW()
  )
  ON CONFLICT ("phoneNumber") DO UPDATE SET
    "name" = COALESCE(EXCLUDED."name", "Contactos"."name"),
    "email" = COALESCE(EXCLUDED."email", "Contactos"."email"),
    "source" = ARRAY(
      SELECT DISTINCT unnest(
        "Contactos"."source" || ARRAY['google_contacts']
      )
    ),
    "updatedAt" = NOW();
END;
$$ LANGUAGE plpgsql;

-- 4. Vista para analizar fuentes
CREATE OR REPLACE VIEW contactos_por_fuente AS
SELECT 
  CASE 
    WHEN 'booking' = ANY(source) AND 'whatsapp' = ANY(source) THEN 'Booking + WhatsApp'
    WHEN 'booking' = ANY(source) AND 'google_contacts' = ANY(source) THEN 'Booking + Google'
    WHEN 'whatsapp' = ANY(source) AND 'google_contacts' = ANY(source) THEN 'WhatsApp + Google'
    WHEN 'booking' = ANY(source) THEN 'Solo Booking'
    WHEN 'whatsapp' = ANY(source) THEN 'Solo WhatsApp'
    WHEN 'google_contacts' = ANY(source) THEN 'Solo Google'
    WHEN 'imported' = ANY(source) THEN 'Importado Manual'
    ELSE 'Sin Fuente'
  END as tipo_fuente,
  COUNT(*) as total,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "Contactos"), 2) as porcentaje
FROM "Contactos"
GROUP BY tipo_fuente
ORDER BY total DESC;

-- 5. Función para obtener estadísticas de fuentes
CREATE OR REPLACE FUNCTION get_source_stats()
RETURNS TABLE(
  fuente TEXT,
  total BIGINT,
  con_whatsapp BIGINT,
  sin_whatsapp BIGINT,
  con_email BIGINT,
  activos_30_dias BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    unnest(ARRAY['booking', 'whatsapp', 'google_contacts', 'imported']) as fuente,
    COUNT(*) FILTER (WHERE unnest(ARRAY['booking', 'whatsapp', 'google_contacts', 'imported']) = ANY(source)) as total,
    COUNT(*) FILTER (WHERE unnest(ARRAY['booking', 'whatsapp', 'google_contacts', 'imported']) = ANY(source) AND "hasWhatsapp" = true) as con_whatsapp,
    COUNT(*) FILTER (WHERE unnest(ARRAY['booking', 'whatsapp', 'google_contacts', 'imported']) = ANY(source) AND "hasWhatsapp" = false) as sin_whatsapp,
    COUNT(*) FILTER (WHERE unnest(ARRAY['booking', 'whatsapp', 'google_contacts', 'imported']) = ANY(source) AND email IS NOT NULL) as con_email,
    COUNT(*) FILTER (WHERE unnest(ARRAY['booking', 'whatsapp', 'google_contacts', 'imported']) = ANY(source) AND "lastActivity" > NOW() - INTERVAL '30 days') as activos_30_dias
  FROM "Contactos";
END;
$$ LANGUAGE plpgsql;

-- 6. Aplicar los triggers
DROP TRIGGER IF EXISTS sync_booking_to_contactos ON "Booking";
CREATE TRIGGER sync_booking_to_contactos
AFTER INSERT OR UPDATE ON "Booking"
FOR EACH ROW
WHEN (NEW."phone" IS NOT NULL)
EXECUTE FUNCTION sync_booking_to_contactos_with_source();

DROP TRIGGER IF EXISTS sync_clientview_to_contactos ON "ClientView";
CREATE TRIGGER sync_clientview_to_contactos
AFTER INSERT OR UPDATE ON "ClientView"
FOR EACH ROW
EXECUTE FUNCTION sync_clientview_to_contactos_with_source();

-- 7. Consultas útiles

-- Ver distribución de fuentes
-- SELECT * FROM contactos_por_fuente;

-- Ver estadísticas por fuente
-- SELECT * FROM get_source_stats();

-- Ver contactos con múltiples fuentes
-- SELECT "phoneNumber", "name", source 
-- FROM "Contactos" 
-- WHERE array_length(source, 1) > 2
-- LIMIT 10;

-- Ver contactos por canal de booking
-- SELECT 
--   CASE 
--     WHEN 'booking_airbnb' = ANY(source) THEN 'Airbnb'
--     WHEN 'booking_booking.com' = ANY(source) THEN 'Booking.com'
--     WHEN 'booking_direct' = ANY(source) THEN 'Directo'
--     ELSE 'Otro'
--   END as canal,
--   COUNT(*) as total
-- FROM "Contactos"
-- WHERE 'booking' = ANY(source)
-- GROUP BY canal;