/**
 * Script para resetear completamente la tabla Leads
 * - Borra todo lo antiguo
 * - Crea estructura nueva optimizada
 * - Sincroniza todas las "Futura Pendiente" desde Bookings
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetLeadsTable() {
    console.log('🚀 INICIANDO RESET COMPLETO DE TABLA LEADS');
    console.log('=' .repeat(60));
    
    try {
        // 1. Contar leads actuales antes de borrar
        console.log('\n📊 Estado actual:');
        const currentCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Leads"`;
        console.log(`   Leads actuales: ${currentCount[0].count}`);
        
        // 2. Borrar tabla completamente y recrearla
        console.log('\n🗑️ Borrando tabla Leads antigua...');
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Leads" CASCADE`);
        console.log('✅ Tabla antigua eliminada');
        
        // 3. Crear nueva estructura optimizada
        console.log('\n🔨 Creando nueva estructura optimizada...');
        await prisma.$executeRawUnsafe(`
            CREATE TABLE "Leads" (
                "id" SERIAL PRIMARY KEY,
                "bookingId" VARCHAR(255) NOT NULL UNIQUE,
                "guestName" VARCHAR(255) NOT NULL,
                "phone" VARCHAR(50) NOT NULL,
                "propertyName" VARCHAR(255) NOT NULL,
                "arrivalDate" DATE NOT NULL,
                "departureDate" DATE NOT NULL,
                "numNights" INTEGER NOT NULL,
                "totalPersons" INTEGER NOT NULL,
                "channel" VARCHAR(100) NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
        `);
        console.log('✅ Nueva estructura creada (10 campos optimizados)');
        
        // 4. Crear índices
        console.log('\n📑 Creando índices optimizados...');
        const indices = [
            'CREATE INDEX "idx_Leads_arrivalDate" ON "Leads"("arrivalDate")',
            'CREATE INDEX "idx_Leads_phone" ON "Leads"("phone")',
            'CREATE INDEX "idx_Leads_channel" ON "Leads"("channel")',
            'CREATE INDEX "idx_Leads_propertyName_arrivalDate" ON "Leads"("propertyName", "arrivalDate")'
        ];
        
        for (const index of indices) {
            await prisma.$executeRawUnsafe(index);
        }
        console.log('✅ Índices creados');
        
        // 5. Crear función de sincronización
        console.log('\n🔄 Creando función de sincronización automática...');
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION public.booking_sync_leads()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            AS $$
            DECLARE
                v_num_nights INTEGER;
            BEGIN
              IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE') THEN
                IF NEW."BDStatus" = 'Futura Pendiente' THEN
                  v_num_nights := COALESCE(
                    NEW."numNights",
                    GREATEST(1, EXTRACT(DAY FROM (NEW."departureDate"::date - NEW."arrivalDate"::date))),
                    1
                  );
                  
                  INSERT INTO "Leads" (
                    "bookingId", "guestName", "phone", "propertyName",
                    "arrivalDate", "departureDate", "numNights", 
                    "totalPersons", "channel"
                  )
                  VALUES (
                    NEW."bookingId",
                    COALESCE(NEW."guestName", 'Sin nombre'),
                    COALESCE(NEW."phone", 'Sin teléfono'),
                    COALESCE(NEW."propertyName", 'Sin propiedad'),
                    NEW."arrivalDate"::date,
                    COALESCE(NEW."departureDate", NEW."arrivalDate")::date,
                    v_num_nights,
                    COALESCE(NEW."totalPersons", 1),
                    COALESCE(NEW."channel", 'Direct')
                  )
                  ON CONFLICT ("bookingId") DO UPDATE SET
                    "guestName"    = EXCLUDED."guestName",
                    "phone"        = EXCLUDED."phone",
                    "propertyName" = EXCLUDED."propertyName",
                    "arrivalDate"  = EXCLUDED."arrivalDate",
                    "departureDate"= EXCLUDED."departureDate",
                    "numNights"    = EXCLUDED."numNights",
                    "totalPersons" = EXCLUDED."totalPersons",
                    "channel"      = EXCLUDED."channel";
                ELSE
                  DELETE FROM "Leads" WHERE "bookingId" = NEW."bookingId";
                END IF;
                RETURN NEW;
              ELSIF (TG_OP = 'DELETE') THEN
                DELETE FROM "Leads" WHERE "bookingId" = OLD."bookingId";
                RETURN OLD;
              END IF;
              RETURN NULL;
            END $$;
        `);
        console.log('✅ Función de sincronización creada');
        
        // 6. Crear triggers
        console.log('\n⚡ Creando triggers automáticos...');
        
        // Eliminar triggers antiguos si existen
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "trg_Booking_sync_leads" ON "Booking"`);
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "trg_Booking_delete_sync_leads" ON "Booking"`);
        
        // Crear nuevos triggers
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER "trg_Booking_sync_leads"
            AFTER INSERT OR UPDATE OF "BDStatus", "guestName", "propertyName",
                                     "arrivalDate", "departureDate", "totalPersons",
                                     "channel", "phone", "numNights"
            ON "Booking"
            FOR EACH ROW
            EXECUTE FUNCTION public.booking_sync_leads()
        `);
        
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER "trg_Booking_delete_sync_leads"
            AFTER DELETE ON "Booking"
            FOR EACH ROW
            EXECUTE FUNCTION public.booking_sync_leads()
        `);
        console.log('✅ Triggers creados');
        
        // 7. Sincronizar todas las "Futura Pendiente"
        console.log('\n📥 Sincronizando reservas "Futura Pendiente"...');
        
        // Contar cuántas hay
        const pendingCount = await prisma.$queryRaw`
            SELECT COUNT(*) as count 
            FROM "Booking" 
            WHERE "BDStatus" = 'Futura Pendiente'
        `;
        console.log(`   Encontradas: ${pendingCount[0].count} reservas pendientes`);
        
        // Insertarlas en Leads
        await prisma.$executeRawUnsafe(`
            INSERT INTO "Leads" (
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
            SELECT 
                "bookingId",
                COALESCE("guestName", 'Sin nombre'),
                COALESCE("phone", 'Sin teléfono'),
                COALESCE("propertyName", 'Sin propiedad'),
                "arrivalDate"::date,
                COALESCE("departureDate", "arrivalDate")::date,
                COALESCE(
                    "numNights",
                    GREATEST(1, EXTRACT(DAY FROM ("departureDate"::date - "arrivalDate"::date))),
                    1
                ),
                COALESCE("totalPersons", 1),
                COALESCE("channel", 'Direct')
            FROM "Booking"
            WHERE "BDStatus" = 'Futura Pendiente'
              AND "bookingId" IS NOT NULL
        `);
        
        // 8. Verificar resultados
        console.log('\n✅ VERIFICACIÓN FINAL:');
        
        const finalCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Leads"`;
        console.log(`   Total Leads creados: ${finalCount[0].count}`);
        
        // Mostrar muestra
        const sample = await prisma.$queryRaw`
            SELECT 
                "bookingId",
                "guestName",
                "phone",
                "propertyName",
                TO_CHAR("arrivalDate", 'DD/MM/YYYY') as "arrivalDate",
                "numNights",
                "totalPersons",
                "channel"
            FROM "Leads"
            ORDER BY "arrivalDate"
            LIMIT 10
        `;
        
        if (sample.length > 0) {
            console.log('\n📋 Primeros 10 leads (ordenados por fecha):');
            console.table(sample);
        }
        
        // Verificar estructura
        const columns = await prisma.$queryRaw`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'Leads'
            ORDER BY ordinal_position
        `;
        
        console.log('\n📊 Estructura de la tabla:');
        console.table(columns);
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎉 ¡RESET COMPLETADO EXITOSAMENTE!');
        console.log('=' .repeat(60));
        console.log('\n✅ La tabla Leads ahora:');
        console.log('   • Tiene solo 10 campos esenciales');
        console.log('   • Fechas sin hora (tipo DATE)');
        console.log('   • Sincronización automática con Bookings');
        console.log('   • Todas las "Futura Pendiente" sincronizadas');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
resetLeadsTable()
    .then(() => {
        console.log('\n✅ Script completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error fatal:', error);
        process.exit(1);
    });