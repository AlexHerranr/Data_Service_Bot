import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrarTablas() {
  try {
    console.log('🔄 MIGRACIÓN: RENOMBRANDO TABLAS A ESPAÑOL');
    console.log('='*60);
    
    // PASO 1: Eliminar triggers existentes
    console.log('\n📝 PASO 1: Eliminando triggers antiguos...');
    
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS sync_booking_to_contactos ON "Booking"
    `);
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS sync_clientview_to_contactos ON "ClientView"
    `);
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS sync_booking_to_leads ON "Booking"
    `);
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS sync_booking_to_ia_crm ON "Booking"
    `);
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS sync_clientview_to_ia_crm ON "ClientView"
    `);
    console.log('   ✅ Triggers eliminados');
    
    // PASO 2: Renombrar tablas una por una
    console.log('\n📝 PASO 2: Renombrando tablas...');
    
    // 2.1 Leads → Oportunidades
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Leads" RENAME TO "Oportunidades"`);
      console.log('   ✅ Leads → Oportunidades');
    } catch (e) {
      console.log('   ⚠️  Leads ya renombrada o no existe');
    }
    
    // 2.2 hotel_apartments → Propiedades
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "hotel_apartments" RENAME TO "Propiedades"`);
      console.log('   ✅ hotel_apartments → Propiedades');
    } catch (e) {
      console.log('   ⚠️  hotel_apartments ya renombrada o no existe');
    }
    
    // 2.3 ClientView → Chats
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "ClientView" RENAME TO "Chats"`);
      console.log('   ✅ ClientView → Chats');
    } catch (e) {
      console.log('   ⚠️  ClientView ya renombrada o no existe');
    }
    
    // 2.4 IA_CRM_Clientes → CRM
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "IA_CRM_Clientes" RENAME TO "CRM"`);
      console.log('   ✅ IA_CRM_Clientes → CRM');
    } catch (e) {
      console.log('   ⚠️  IA_CRM_Clientes ya renombrada o no existe');
    }
    
    // 2.5 Contactos → Clientes
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Contactos" RENAME TO "Clientes"`);
      console.log('   ✅ Contactos → Clientes');
    } catch (e) {
      console.log('   ⚠️  Contactos ya renombrada o no existe');
    }
    
    // 2.6 Booking → Reservas
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Booking" RENAME TO "Reservas"`);
      console.log('   ✅ Booking → Reservas');
    } catch (e) {
      console.log('   ⚠️  Booking ya renombrada o no existe');
    }
    
    // PASO 3: Crear nuevas funciones
    console.log('\n📝 PASO 3: Creando nuevas funciones...');
    
    // Función sync_reservas_to_clientes
    await prisma.$executeRawUnsafe(`
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
          NOW(),
          ARRAY['reservas', CONCAT('reservas_', LOWER(COALESCE(NEW."channel", 'directo')))],
          'active',
          false
        )
        ON CONFLICT ("phoneNumber") DO UPDATE SET
          "name" = COALESCE(EXCLUDED."name", "Clientes"."name"),
          "email" = COALESCE(EXCLUDED."email", "Clientes"."email"),
          "totalBookings" = "Clientes"."totalBookings" + 1,
          "lastActivity" = NOW(),
          "source" = ARRAY(
            SELECT DISTINCT unnest(
              "Clientes"."source" || ARRAY['reservas']
            )
          ),
          "updatedAt" = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    console.log('   ✅ Función sync_reservas_to_clientes creada');
    
    // Función sync_chats_to_clientes
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION sync_chats_to_clientes()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO "Clientes" (
          "phoneNumber",
          "name",
          "whatsappChatId",
          "whatsappLabels",
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
          true,
          NEW."lastActivity",
          ARRAY['whatsapp', 'chats'],
          'active'
        )
        ON CONFLICT ("phoneNumber") DO UPDATE SET
          "name" = COALESCE(EXCLUDED."name", "Clientes"."name"),
          "whatsappChatId" = EXCLUDED."whatsappChatId",
          "whatsappLabels" = EXCLUDED."whatsappLabels",
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
      $$ LANGUAGE plpgsql
    `);
    console.log('   ✅ Función sync_chats_to_clientes creada');
    
    // PASO 4: Crear nuevos triggers
    console.log('\n📝 PASO 4: Creando nuevos triggers...');
    
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER sync_reservas_to_clientes
      AFTER INSERT OR UPDATE ON "Reservas"
      FOR EACH ROW
      WHEN (NEW."phone" IS NOT NULL)
      EXECUTE FUNCTION sync_reservas_to_clientes()
    `);
    console.log('   ✅ Trigger sync_reservas_to_clientes creado');
    
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER sync_chats_to_clientes
      AFTER INSERT OR UPDATE ON "Chats"
      FOR EACH ROW
      EXECUTE FUNCTION sync_chats_to_clientes()
    `);
    console.log('   ✅ Trigger sync_chats_to_clientes creado');
    
    // PASO 5: Verificar resultado
    console.log('\n📊 VERIFICACIÓN FINAL:');
    
    const tablasFinales = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' 
      AND table_name IN ('Reservas', 'Chats', 'Clientes', 'CRM', 'Oportunidades', 'Propiedades')
      ORDER BY table_name
    `;
    
    console.log('\n✅ TABLAS CON NOMBRES EN ESPAÑOL:');
    tablasFinales.forEach(t => {
      let descripcion = '';
      switch(t.table_name) {
        case 'Reservas': descripcion = '(antes Booking)'; break;
        case 'Chats': descripcion = '(antes ClientView)'; break;
        case 'Clientes': descripcion = '(antes Contactos)'; break;
        case 'CRM': descripcion = '(antes IA_CRM_Clientes)'; break;
        case 'Oportunidades': descripcion = '(antes Leads)'; break;
        case 'Propiedades': descripcion = '(antes hotel_apartments)'; break;
      }
      console.log(`   • ${t.table_name} ${descripcion}`);
    });
    
    // Contar registros
    console.log('\n📈 CONTEO DE REGISTROS:');
    
    const conteos = await prisma.$queryRaw`
      SELECT 
        'Reservas' as tabla, 
        (SELECT COUNT(*) FROM "Reservas") as total
      UNION ALL
      SELECT 'Chats', (SELECT COUNT(*) FROM "Chats")
      UNION ALL
      SELECT 'Clientes', (SELECT COUNT(*) FROM "Clientes")
      UNION ALL
      SELECT 'CRM', (SELECT COUNT(*) FROM "CRM")
      UNION ALL
      SELECT 'Oportunidades', (SELECT COUNT(*) FROM "Oportunidades")
      UNION ALL
      SELECT 'Propiedades', (SELECT COUNT(*) FROM "Propiedades")
    `;
    
    conteos.forEach(c => {
      console.log(`   ${c.tabla}: ${c.total} registros`);
    });
    
    console.log('\n' + '='*60);
    console.log('✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
    console.log('='*60);
    
    console.log('\n⚠️  PRÓXIMOS PASOS IMPORTANTES:');
    console.log('   1. Copia el archivo schema_nuevo.prisma sobre schema.prisma');
    console.log('   2. Ejecuta: npx prisma generate');
    console.log('   3. Actualiza los imports en tus scripts');
    console.log('   4. Los nuevos nombres de modelos en Prisma son:');
    console.log('      • prisma.reservas (antes prisma.booking)');
    console.log('      • prisma.chats (antes prisma.clientView)');
    console.log('      • prisma.clientes (antes prisma.contactos)');
    console.log('      • prisma.cRM (antes prisma.iA_CRM_Clientes)');
    console.log('      • prisma.oportunidades (antes prisma.leads)');
    console.log('      • prisma.propiedades (antes prisma.hotel_apartments)');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

migrarTablas();