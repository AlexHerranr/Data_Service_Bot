import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function aplicarTriggers() {
  try {
    console.log('🔧 APLICANDO TRIGGERS DE SINCRONIZACIÓN');
    console.log('='*60);
    
    // 1. Crear función para sincronizar Booking -> Contactos
    console.log('\n📝 Creando función sync_booking_to_contactos...');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION sync_booking_to_contactos()
      RETURNS TRIGGER AS $$
      BEGIN
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
          COALESCE(CAST(REPLACE(REPLACE(NEW."totalCharges", ',', ''), '$', '') AS DECIMAL), 0),
          NOW(),
          ARRAY['booking', CONCAT('booking_', LOWER(COALESCE(NEW."channel", 'direct')))],
          'active',
          false
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
    `);
    console.log('   ✅ Función creada');
    
    // 2. Crear función para sincronizar ClientView -> Contactos
    console.log('\n📝 Creando función sync_clientview_to_contactos...');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION sync_clientview_to_contactos()
      RETURNS TRIGGER AS $$
      BEGIN
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
          ARRAY['whatsapp', 'clientview'],
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
    `);
    console.log('   ✅ Función creada');
    
    // 3. Aplicar trigger para Booking
    console.log('\n🔗 Aplicando trigger para Booking...');
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS sync_booking_to_contactos ON "Booking";
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER sync_booking_to_contactos
      AFTER INSERT OR UPDATE ON "Booking"
      FOR EACH ROW
      WHEN (NEW."phone" IS NOT NULL)
      EXECUTE FUNCTION sync_booking_to_contactos();
    `);
    console.log('   ✅ Trigger aplicado');
    
    // 4. Aplicar trigger para ClientView
    console.log('\n🔗 Aplicando trigger para ClientView...');
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS sync_clientview_to_contactos ON "ClientView";
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER sync_clientview_to_contactos
      AFTER INSERT OR UPDATE ON "ClientView"
      FOR EACH ROW
      EXECUTE FUNCTION sync_clientview_to_contactos();
    `);
    console.log('   ✅ Trigger aplicado');
    
    // 5. Crear vista para análisis de fuentes
    console.log('\n📊 Creando vista de análisis...');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE VIEW contactos_por_fuente AS
      SELECT 
        CASE 
          WHEN 'booking' = ANY(source) AND 'whatsapp' = ANY(source) THEN 'Booking + WhatsApp'
          WHEN 'booking' = ANY(source) THEN 'Solo Booking'
          WHEN 'whatsapp' = ANY(source) THEN 'Solo WhatsApp'
          WHEN 'imported' = ANY(source) THEN 'Importado Manual'
          ELSE 'Sin Fuente'
        END as tipo_fuente,
        COUNT(*) as total,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "Contactos"), 2) as porcentaje
      FROM "Contactos"
      GROUP BY tipo_fuente
      ORDER BY total DESC;
    `);
    console.log('   ✅ Vista creada');
    
    // 6. Verificar que todo funciona
    console.log('\n🔍 Verificando configuración...');
    
    const triggers = await prisma.$queryRaw`
      SELECT 
        tgname as trigger_name,
        tgrelid::regclass as table_name,
        proname as function_name
      FROM pg_trigger t
      JOIN pg_proc p ON t.tgfoid = p.oid
      WHERE tgname IN ('sync_booking_to_contactos', 'sync_clientview_to_contactos');
    `;
    
    console.log('\n✅ TRIGGERS ACTIVOS:');
    triggers.forEach(t => {
      console.log(`   • ${t.trigger_name} en ${t.table_name}`);
    });
    
    // Mostrar estadísticas de fuentes
    const estadisticas = await prisma.$queryRaw`
      SELECT * FROM contactos_por_fuente;
    `;
    
    console.log('\n📈 DISTRIBUCIÓN DE FUENTES:');
    estadisticas.forEach(e => {
      console.log(`   ${e.tipo_fuente}: ${e.total} contactos (${e.porcentaje}%)`);
    });
    
    console.log('\n✅ SISTEMA DE SINCRONIZACIÓN ACTIVADO');
    console.log('Los nuevos contactos se sincronizarán automáticamente con sus fuentes');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Los triggers ya estaban configurados');
    }
  } finally {
    await prisma.$disconnect();
  }
}

aplicarTriggers();