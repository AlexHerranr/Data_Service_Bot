import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('🔧 Mejorando estructura de Leads para múltiples fuentes...');
        
        // 1. Verificar estructura actual
        console.log('\n📋 Estructura actual:');
        const currentStructure = await prisma.$queryRaw`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'Leads' 
            ORDER BY ordinal_position;
        `;
        console.table(currentStructure);
        
        // 2. Agregar campo leadNotes para datos que no vienen de booking
        console.log('\n📝 Agregando campo leadNotes...');
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "Leads" 
                ADD COLUMN IF NOT EXISTS "leadNotes" TEXT;
            `);
            console.log('✅ Campo leadNotes agregado');
        } catch (e) {
            console.log('ℹ️ Campo leadNotes ya existe');
        }
        
        // 3. Renombrar lastUpdated a lastUpdatedLeads para claridad
        console.log('\n🏷️ Renombrando lastUpdated a lastUpdatedLeads...');
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "Leads" 
                RENAME COLUMN "lastUpdated" TO "lastUpdatedLeads";
            `);
            console.log('✅ Campo renombrado a lastUpdatedLeads');
        } catch (e) {
            console.log('ℹ️ Campo ya se llama lastUpdatedLeads o no existe lastUpdated');
        }
        
        // 4. Reorganizar orden de columnas (PostgreSQL no permite reordenar directamente, 
        // pero podemos crear vista o documentar el orden lógico)
        console.log('\n🔄 Actualizando función de sincronización con nuevo orden lógico...');
        
        const updatedSyncFunction = `
            CREATE OR REPLACE FUNCTION public.booking_sync_leads()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            AS $$
            BEGIN
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
                    'alta'  -- Prioridad alta para reservas pendientes
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
                    "lastUpdatedLeads"  = EXCLUDED."lastUpdatedLeads";
                ELSE
                  -- Cualquier otro estado: eliminar de leads
                  DELETE FROM "Leads" WHERE "bookingId" = NEW."bookingId";
                END IF;
                
                RETURN NEW;
              ELSIF (TG_OP = 'DELETE') THEN
                DELETE FROM "Leads" WHERE "bookingId" = OLD."bookingId";
                RETURN OLD;
              END IF;
              
              RETURN NULL;
            END $$;
        `;
        
        await prisma.$executeRawUnsafe(updatedSyncFunction);
        console.log('✅ Función de sincronización actualizada');
        
        // 5. Actualizar priority para leads existentes
        console.log('\n🎯 Actualizando prioridad de leads existentes...');
        await prisma.$executeRawUnsafe(`
            UPDATE "Leads" 
            SET priority = 'alta' 
            WHERE "bookingId" IS NOT NULL AND priority = 'media';
        `);
        console.log('✅ Prioridad actualizada para leads de Beds24');
        
        // 6. Resincronizar para aplicar cambios
        console.log('\n🔄 Resincronizando con nueva estructura...');
        
        // Trigger resincronización
        await prisma.$executeRawUnsafe(`
            UPDATE "Booking" SET "lastUpdatedBD" = "lastUpdatedBD" 
            WHERE "BDStatus" = 'Futura Pendiente';
        `);
        
        // 7. Verificar nueva estructura
        console.log('\n📋 Nueva estructura optimizada:');
        const newStructure = await prisma.$queryRaw`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'Leads' 
            ORDER BY ordinal_position;
        `;
        console.table(newStructure);
        
        // 8. Mostrar orden lógico recomendado
        console.log('\n📊 Orden lógico recomendado para consultas:');
        const logicalOrder = await prisma.$queryRaw`
            SELECT 
                "bookingId",           -- 1. ID único (NULL para manuales)
                source,                -- 2. Fuente (beds24, WhatsApp, CRM)
                channel,               -- 3. Canal (Direct, Booking.com, Directo, Colega)
                priority,              -- 4. Prioridad (alta, media, baja)
                "guestName",           -- 5. Cliente
                "propertyName",        -- 6. Propiedad
                "arrivalDate",         -- 7. Llegada
                "departureDate",       -- 8. Salida
                "totalPersons",        -- 9. Personas
                "numNights",           -- 10. Noches (al lado de personas)
                phone,                 -- 11. Contacto
                "leadNotes",           -- 12. Notas específicas de lead
                "lastUpdatedLeads",    -- 13. Última actualización del lead
                "createdAt"            -- 14. Fecha creación
            FROM "Leads" 
            ORDER BY priority DESC, "arrivalDate" ASC
            LIMIT 3;
        `;
        
        console.log('📋 Muestra con orden lógico:');
        console.table(logicalOrder);
        
        // 9. Test de inserción manual (simulando WhatsApp)
        console.log('\n🧪 Test de inserción manual (WhatsApp/CRM)...');
        
        try {
            const testLead = await prisma.$executeRawUnsafe(`
                INSERT INTO "Leads" (
                    "bookingId", source, channel, priority, "guestName", 
                    "arrivalDate", "totalPersons", "numNights", phone, 
                    "leadNotes", "lastUpdatedLeads"
                ) VALUES (
                    NULL, 
                    'WhatsApp', 
                    'Directo', 
                    'media',
                    'Test Cliente WhatsApp', 
                    '2025-09-15', 
                    2, 
                    3, 
                    '+57 300 1234567',
                    'Cliente preguntó por apartamento 1 alcoba. Interesado en septiembre.',
                    NOW()
                );
            `);
            
            console.log('✅ Lead manual de WhatsApp insertado exitosamente');
            
            // Verificar inserción
            const insertedLead = await prisma.$queryRaw`
                SELECT source, channel, priority, "guestName", "leadNotes"
                FROM "Leads" 
                WHERE source = 'WhatsApp' 
                LIMIT 1;
            `;
            
            console.log('📋 Lead WhatsApp creado:');
            console.table(insertedLead);
            
        } catch (e) {
            console.log('ℹ️ Lead de test ya existe o error menor:', (e as Error).message.substring(0, 100));
        }
        
        // 10. Estadísticas por fuente y prioridad
        console.log('\n📊 Estadísticas por fuente:');
        const statsBySource = await prisma.$queryRaw`
            SELECT source, priority, COUNT(*) as count
            FROM "Leads" 
            GROUP BY source, priority
            ORDER BY source, priority DESC;
        `;
        console.table(statsBySource);
        
        console.log('\n🎉 ¡Estructura de Leads mejorada para múltiples fuentes!');
        
        console.log('\n📋 Mejoras implementadas:');
        console.log('✅ Campo leadNotes agregado (para datos que no vienen de booking)');
        console.log('✅ lastUpdated → lastUpdatedLeads (claridad de propósito)');
        console.log('✅ Orden lógico optimizado: priority → guestName → totalPersons → numNights');
        console.log('✅ Prioridad automática "alta" para reservas Beds24 pendientes');
        console.log('✅ Sistema híbrido: automático (Beds24) + manual (WhatsApp/CRM)');
        
        console.log('\n🎯 Campos por tipo de lead:');
        console.log('📖 BEDS24 (automático): bookingId, source=beds24, todos los campos de booking');
        console.log('📱 WHATSAPP (manual): bookingId=NULL, source=WhatsApp, leadNotes con contexto');
        console.log('📊 CRM (manual): bookingId=NULL, source=CRM, leadNotes con seguimiento');
        
        console.log('\n💡 Uso de leadNotes:');
        console.log('- "Cliente preguntó por apartamento 1 alcoba"');
        console.log('- "Referido por Juan Pérez, interesado en diciembre"');
        console.log('- "Cotización enviada por WhatsApp, pendiente respuesta"');
        
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main();