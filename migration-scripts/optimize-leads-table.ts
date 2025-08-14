import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('🔧 Optimizando tabla Leads - removiendo campos innecesarios y agregando numNights...');
        
        // 1. Verificar estructura actual
        console.log('\n📋 Verificando estructura actual de Leads...');
        const currentStructure = await prisma.$queryRaw`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'Leads' 
            ORDER BY ordinal_position;
        `;
        
        console.log('Estructura actual:');
        console.table(currentStructure);
        
        // 2. Eliminar campos innecesarios
        console.log('\n🗑️ Eliminando campos innecesarios...');
        
        const fieldsToRemove = [
            'assignedTo',
            'lastContactAt', 
            'nextFollowUp',
            'leadType',
            'estimatedValue'
        ];
        
        for (const field of fieldsToRemove) {
            try {
                await prisma.$executeRawUnsafe(`
                    ALTER TABLE "Leads" DROP COLUMN IF EXISTS "${field}";
                `);
                console.log(`✅ Campo ${field} eliminado`);
            } catch (e) {
                console.log(`ℹ️ Campo ${field} no existe o ya fue eliminado`);
            }
        }
        
        // 3. Agregar campo numNights
        console.log('\n➕ Agregando campo numNights...');
        
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "Leads" 
                ADD COLUMN IF NOT EXISTS "numNights" INTEGER;
            `);
            console.log('✅ Campo numNights agregado');
        } catch (e) {
            console.log('ℹ️ Campo numNights ya existe');
        }
        
        // 4. Actualizar función de sincronización
        console.log('\n🔄 Actualizando función de sincronización...');
        
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
                    "arrivalDate", "departureDate", "numNights", "totalPersons",
                    "phone", "lastUpdated"
                  )
                  VALUES (
                    NEW."bookingId",
                    'beds24',
                    NEW."channel",
                    NEW."guestName",
                    NEW."propertyName",
                    NEW."arrivalDate",
                    NEW."departureDate",
                    NEW."numNights",
                    NEW."totalPersons",
                    COALESCE(NEW."phone",'N/A'),
                    NEW."lastUpdatedBD"
                  )
                  ON CONFLICT ("bookingId") DO UPDATE SET
                    "source"       = EXCLUDED."source",
                    "channel"      = EXCLUDED."channel",
                    "guestName"    = EXCLUDED."guestName",
                    "propertyName" = EXCLUDED."propertyName",
                    "arrivalDate"  = EXCLUDED."arrivalDate",
                    "departureDate"= EXCLUDED."departureDate",
                    "numNights"    = EXCLUDED."numNights",
                    "totalPersons" = EXCLUDED."totalPersons",
                    "phone"        = EXCLUDED."phone",
                    "lastUpdated"  = EXCLUDED."lastUpdated";
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
        
        // 5. Sincronización inicial con nuevos campos
        console.log('\n🔄 Sincronización inicial con estructura optimizada...');
        
        // Limpiar leads actuales
        const deleteResult = await prisma.leads.deleteMany();
        console.log(`🗑️ Eliminados ${deleteResult.count} leads existentes`);
        
        // Triggear resincronización
        await prisma.$executeRawUnsafe(`
            UPDATE "Booking" SET "lastUpdatedBD" = "lastUpdatedBD" 
            WHERE "BDStatus" = 'Futura Pendiente';
        `);
        
        // 6. Verificar resultado
        console.log('\n📊 Verificando resultado...');
        
        const newLeadsCount = await prisma.leads.count();
        console.log(`📋 Leads creados: ${newLeadsCount}`);
        
        if (newLeadsCount > 0) {
            // Usar query raw para evitar problemas con schema
            const sampleLeads = await prisma.$queryRaw`
                SELECT 
                    "bookingId", "source", "channel", "guestName", 
                    "propertyName", "arrivalDate", "numNights", "totalPersons"
                FROM "Leads" 
                ORDER BY "arrivalDate" 
                LIMIT 3;
            `;
            
            console.log('\n📋 Primeros 3 leads con estructura optimizada:');
            console.table(sampleLeads);
        }
        
        // 7. Verificar nueva estructura
        console.log('\n📋 Nueva estructura de tabla Leads:');
        const newStructure = await prisma.$queryRaw`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'Leads' 
            ORDER BY ordinal_position;
        `;
        
        console.table(newStructure);
        
        // 8. Test de funcionalidad
        console.log('\n🧪 Test de funcionalidad con nueva estructura...');
        
        const testBookingId = '73842286';
        
        // Verificar que el lead tiene los nuevos campos
        const testLead = await prisma.$queryRaw`
            SELECT * FROM "Leads" WHERE "bookingId" = ${testBookingId} LIMIT 1;
        `;
        
        if (testLead && (testLead as any).length > 0) {
            console.log('✅ Lead de prueba encontrado:');
            console.table(testLead);
            
            const lead = (testLead as any)[0];
            const hasRequiredFields = lead.source && lead.channel && lead.guestName && 
                                    lead.propertyName && lead.arrivalDate;
            
            if (hasRequiredFields) {
                console.log('✅ SUCCESS: Todos los campos requeridos están presentes');
            } else {
                console.log('❌ ERROR: Faltan campos requeridos');
            }
        }
        
        console.log('\n🎉 ¡Optimización de tabla Leads completada!');
        
        console.log('\n📋 Estructura final optimizada:');
        console.log('Campos principales (orden):');
        console.log('1. source (beds24)');
        console.log('2. channel (Direct, Booking.com, etc.)');
        console.log('3. guestName');
        console.log('4. propertyName'); 
        console.log('5. arrivalDate');
        console.log('6. departureDate');
        console.log('7. numNights (calculado automáticamente)');
        console.log('8. totalPersons');
        console.log('9. phone');
        console.log('10. lastUpdated');
        
        console.log('\n✅ Campos eliminados:');
        console.log('- assignedTo (innecesario para leads automáticos)');
        console.log('- lastContactAt (innecesario para leads automáticos)');
        console.log('- nextFollowUp (innecesario para leads automáticos)');
        console.log('- leadType (redundante - siempre son reservas pendientes)');
        console.log('- estimatedValue (métrica innecesaria por ahora)');
        
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main();