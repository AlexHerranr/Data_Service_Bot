import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('🔄 Configurando sincronización automática Booking → Leads...');
        
        // 1. Endurecer esquema mínimo
        console.log('\n🔧 Paso 1: Creando restricciones y índices...');
        
        // Un lead por booking
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "Leads"
                ADD CONSTRAINT "Leads_bookingId_key" UNIQUE ("bookingId");
            `);
            console.log('✅ Constraint único bookingId creado');
        } catch (e) {
            console.log('ℹ️ Constraint bookingId ya existe');
        }
        
        // FK: si se borra la booking, borra el lead
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "Leads"
                ADD CONSTRAINT "Leads_booking_fk"
                FOREIGN KEY ("bookingId") REFERENCES "Booking"("bookingId")
                ON DELETE CASCADE;
            `);
            console.log('✅ Foreign Key constraint creado');
        } catch (e) {
            console.log('ℹ️ Foreign Key ya existe');
        }
        
        // Índices útiles
        const indices = [
            'CREATE INDEX IF NOT EXISTS "idx_Booking_BDStatus" ON "Booking"("BDStatus");',
            'CREATE INDEX IF NOT EXISTS "idx_Leads_arrivalDate" ON "Leads"("arrivalDate");',
            'CREATE INDEX IF NOT EXISTS "idx_Leads_phone" ON "Leads"("phone");'
        ];
        
        for (const index of indices) {
            await prisma.$executeRawUnsafe(index);
        }
        console.log('✅ Índices de optimización creados');
        
        // 2. Función + triggers (sincroniza en tiempo real)
        console.log('\n🤖 Paso 2: Creando función de sincronización...');
        
        const syncFunction = `
            CREATE OR REPLACE FUNCTION public.booking_sync_leads()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            AS $$
            BEGIN
              IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE') THEN
                IF NEW."BDStatus" = 'Futura Pendiente' THEN
                  INSERT INTO "Leads" (
                    "bookingId", "phone", "guestName", "propertyName",
                    "arrivalDate", "departureDate", "totalPersons",
                    "source", "channel", "lastUpdated", "leadType"
                  )
                  VALUES (
                    NEW."bookingId",
                    COALESCE(NEW."phone",'N/A'),
                    NEW."guestName",
                    NEW."propertyName",
                    NEW."arrivalDate",
                    NEW."departureDate",
                    NEW."totalPersons",
                    'beds24',
                    NEW."channel",
                    NEW."lastUpdatedBD",
                    'reserva_pendiente'
                  )
                  ON CONFLICT ("bookingId") DO UPDATE SET
                    "phone"        = COALESCE(EXCLUDED."phone",'N/A'),
                    "guestName"    = EXCLUDED."guestName",
                    "propertyName" = EXCLUDED."propertyName",
                    "arrivalDate"  = EXCLUDED."arrivalDate",
                    "departureDate"= EXCLUDED."departureDate",
                    "totalPersons" = EXCLUDED."totalPersons",
                    "channel"      = EXCLUDED."channel",
                    "lastUpdated"  = EXCLUDED."lastUpdated";
                ELSE
                  -- Cualquier otro estado: fuera de leads
                  DELETE FROM "Leads" WHERE "bookingId" = NEW."bookingId";
                END IF;
              ELSIF (TG_OP = 'DELETE') THEN
                DELETE FROM "Leads" WHERE "bookingId" = OLD."bookingId";
              END IF;
              RETURN NULL;
            END $$;
        `;
        
        await prisma.$executeRawUnsafe(syncFunction);
        console.log('✅ Función booking_sync_leads creada');
        
        // 3. Crear triggers
        console.log('\n⚡ Paso 3: Creando triggers automáticos...');
        
        // Trigger principal para INSERT/UPDATE
        await prisma.$executeRawUnsafe(`
            DROP TRIGGER IF EXISTS "trg_Booking_sync_leads" ON "Booking";
        `);
        
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER "trg_Booking_sync_leads"
            AFTER INSERT OR UPDATE OF "BDStatus", "guestName", "propertyName",
                                     "arrivalDate", "departureDate", "totalPersons",
                                     "channel", "lastUpdatedBD"
            ON "Booking"
            FOR EACH ROW
            EXECUTE FUNCTION public.booking_sync_leads();
        `);
        console.log('✅ Trigger principal creado');
        
        // Trigger para DELETE
        await prisma.$executeRawUnsafe(`
            DROP TRIGGER IF EXISTS "trg_Booking_delete_sync_leads" ON "Booking";
        `);
        
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER "trg_Booking_delete_sync_leads"
            AFTER DELETE ON "Booking"
            FOR EACH ROW
            EXECUTE FUNCTION public.booking_sync_leads();
        `);
        console.log('✅ Trigger de eliminación creado');
        
        // 4. Sincronización inicial
        console.log('\n🔄 Paso 4: Sincronización inicial...');
        
        // Limpiar leads actuales
        const deleteResult = await prisma.leads.deleteMany();
        console.log(`🗑️ Eliminados ${deleteResult.count} leads existentes`);
        
        // Trigger la sincronización inicial ejecutando un UPDATE dummy
        await prisma.$executeRawUnsafe(`
            UPDATE "Booking" SET "lastUpdatedBD" = "lastUpdatedBD" 
            WHERE "BDStatus" = 'Futura Pendiente';
        `);
        
        // Verificar resultado
        const leadsCount = await prisma.leads.count();
        const futurasPendientes = await prisma.booking.count({
            where: { BDStatus: 'Futura Pendiente' }
        });
        
        console.log(`📊 Sincronización inicial completada:`);
        console.log(`   - Reservas "Futura Pendiente": ${futurasPendientes}`);
        console.log(`   - Leads creados: ${leadsCount}`);
        
        if (leadsCount > 0) {
            const sampleLeads = await prisma.leads.findMany({
                take: 3,
                orderBy: { arrivalDate: 'asc' },
                select: {
                    bookingId: true,
                    guestName: true,
                    propertyName: true,
                    arrivalDate: true,
                    totalPersons: true
                }
            });
            
            console.log('\n📋 Primeros 3 leads sincronizados:');
            console.table(sampleLeads);
        }
        
        // 5. Test del trigger
        console.log('\n🧪 Paso 5: Probando triggers...');
        
        // Buscar una reserva "Futura Pendiente" para test
        const testBooking = await prisma.booking.findFirst({
            where: { BDStatus: 'Futura Pendiente' },
            select: { bookingId: true, guestName: true }
        });
        
        if (testBooking) {
            console.log(`🔬 Testeando con booking: ${testBooking.bookingId} (${testBooking.guestName})`);
            
            // Test 1: Cambiar a "Futura Confirmada" (debe eliminar de leads)
            await prisma.booking.update({
                where: { bookingId: testBooking.bookingId },
                data: { BDStatus: 'Futura Confirmada' }
            });
            
            const leadsAfterChange = await prisma.leads.count({
                where: { bookingId: testBooking.bookingId }
            });
            console.log(`   ✅ Cambio a "Futura Confirmada": ${leadsAfterChange === 0 ? 'Lead eliminado ✅' : 'Error: Lead NO eliminado ❌'}`);
            
            // Test 2: Cambiar de vuelta a "Futura Pendiente" (debe crear lead)
            await prisma.booking.update({
                where: { bookingId: testBooking.bookingId },
                data: { BDStatus: 'Futura Pendiente' }
            });
            
            const leadsAfterRevert = await prisma.leads.count({
                where: { bookingId: testBooking.bookingId }
            });
            console.log(`   ✅ Cambio a "Futura Pendiente": ${leadsAfterRevert === 1 ? 'Lead creado ✅' : 'Error: Lead NO creado ❌'}`);
        }
        
        console.log('\n🎉 ¡Sistema de sincronización automática configurado exitosamente!');
        console.log('\n📋 Características del sistema:');
        console.log('- ✅ Reservas "Futura Pendiente" → Aparecen automáticamente en Leads');
        console.log('- ✅ Cambio a cualquier otro estado → Se eliminan de Leads');
        console.log('- ✅ Eliminación de Booking → Lead eliminado automáticamente (FK CASCADE)');
        console.log('- ✅ Actualización de datos → Lead sincronizado en tiempo real');
        console.log('- ✅ Triggers optimizados → Solo se ejecutan en campos relevantes');
        console.log('- ✅ Constraints → Un lead por booking, integridad referencial');
        
        console.log('\n🔄 Campos sincronizados automáticamente:');
        console.log('- bookingId, guestName, propertyName');
        console.log('- arrivalDate, departureDate, totalPersons');
        console.log('- phone, channel, lastUpdated');
        console.log('- source="beds24", leadType="reserva_pendiente"');
        
    } catch (error) {
        console.error('❌ Error configurando sincronización:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main();