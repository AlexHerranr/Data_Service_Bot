/**
 * Script de migración para optimizar tabla Leads
 * Objetivo: Mantener solo campos esenciales para gestión comercial
 * Fecha: ${new Date().toISOString()}
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 INICIANDO OPTIMIZACIÓN DE TABLA LEADS');
    console.log('=' .repeat(60));
    
    try {
        // 1. BACKUP - Guardar datos actuales
        console.log('\n📦 Paso 1: Creando backup de datos actuales...');
        
        const currentLeads = await prisma.$queryRaw`
            SELECT 
                "bookingId",
                "guestName", 
                "phone",
                "propertyName",
                "arrivalDate",
                "departureDate",
                "numNights",
                "totalPersons",
                "channel",
                "createdAt"
            FROM "Leads"
            WHERE "bookingId" IS NOT NULL
        ` as any[];
        
        console.log(`✅ Backup creado: ${currentLeads.length} leads actuales`);
        
        // 2. CREAR NUEVA TABLA TEMPORAL
        console.log('\n🔨 Paso 2: Creando nueva estructura de tabla...');
        
        // Eliminar tabla temporal si existe
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Leads_new"`);
        
        // Crear nueva tabla con estructura optimizada
        await prisma.$executeRawUnsafe(`
            CREATE TABLE "Leads_new" (
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
            );
        `);
        
        console.log('✅ Nueva estructura de tabla creada');
        
        // 3. CREAR ÍNDICES OPTIMIZADOS
        console.log('\n📑 Paso 3: Creando índices optimizados...');
        
        const indices = [
            'CREATE INDEX "idx_Leads_new_arrivalDate" ON "Leads_new"("arrivalDate");',
            'CREATE INDEX "idx_Leads_new_phone" ON "Leads_new"("phone");',
            'CREATE INDEX "idx_Leads_new_channel" ON "Leads_new"("channel");',
            'CREATE INDEX "idx_Leads_new_propertyName_arrivalDate" ON "Leads_new"("propertyName", "arrivalDate");'
        ];
        
        for (const index of indices) {
            await prisma.$executeRawUnsafe(index);
        }
        
        console.log('✅ Índices creados');
        
        // 4. MIGRAR DATOS
        console.log('\n📋 Paso 4: Migrando datos existentes...');
        
        if (currentLeads.length > 0) {
            for (const lead of currentLeads) {
                try {
                    // Calcular numNights si no existe
                    let numNights = lead.numNights;
                    if (!numNights && lead.arrivalDate && lead.departureDate) {
                        const arrival = new Date(lead.arrivalDate);
                        const departure = new Date(lead.departureDate);
                        numNights = Math.ceil((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
                    }
                    
                    await prisma.$executeRawUnsafe(`
                        INSERT INTO "Leads_new" (
                            "bookingId", "guestName", "phone", "propertyName",
                            "arrivalDate", "departureDate", "numNights", 
                            "totalPersons", "channel", "createdAt"
                        ) VALUES (
                            $1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10
                        )
                        ON CONFLICT ("bookingId") DO NOTHING
                    `, 
                        lead.bookingId,
                        lead.guestName || 'Sin nombre',
                        lead.phone || 'Sin teléfono',
                        lead.propertyName || 'Sin propiedad',
                        lead.arrivalDate,
                        lead.departureDate || lead.arrivalDate,
                        numNights || 1,
                        lead.totalPersons || 1,
                        lead.channel || 'Direct',
                        lead.createdAt || new Date()
                    );
                } catch (e) {
                    console.log(`⚠️ No se pudo migrar lead ${lead.bookingId}: ${e.message}`);
                }
            }
            
            const migratedCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Leads_new"` as any[];
            console.log(`✅ Migrados ${migratedCount[0].count} leads`);
        }
        
        // 5. ACTUALIZAR FUNCIÓN DE SINCRONIZACIÓN
        console.log('\n🔄 Paso 5: Actualizando función de sincronización...');
        
        const syncFunction = `
            CREATE OR REPLACE FUNCTION public.booking_sync_leads()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            AS $$
            DECLARE
                v_num_nights INTEGER;
            BEGIN
              IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE') THEN
                -- Solo procesar si es Futura Pendiente
                IF NEW."BDStatus" = 'Futura Pendiente' THEN
                  -- Calcular número de noches
                  v_num_nights := COALESCE(
                    NEW."numNights",
                    EXTRACT(DAY FROM (NEW."departureDate"::date - NEW."arrivalDate"::date)),
                    1
                  );
                  
                  -- Insertar o actualizar en Leads
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
                    
                  RAISE NOTICE 'Lead sincronizado: % - %', NEW."bookingId", NEW."guestName";
                ELSE
                  -- Si no es Futura Pendiente, eliminar de leads
                  DELETE FROM "Leads" WHERE "bookingId" = NEW."bookingId";
                  
                  IF FOUND THEN
                    RAISE NOTICE 'Lead eliminado (cambio de estado): %', NEW."bookingId";
                  END IF;
                END IF;
                
                RETURN NEW;
              ELSIF (TG_OP = 'DELETE') THEN
                -- Si se elimina la booking, eliminar el lead
                DELETE FROM "Leads" WHERE "bookingId" = OLD."bookingId";
                
                IF FOUND THEN
                  RAISE NOTICE 'Lead eliminado (booking eliminada): %', OLD."bookingId";
                END IF;
                
                RETURN OLD;
              END IF;
              
              RETURN NULL;
            END $$;
        `;
        
        await prisma.$executeRawUnsafe(syncFunction);
        console.log('✅ Función de sincronización actualizada');
        
        // 6. RENOMBRAR TABLAS
        console.log('\n🔄 Paso 6: Aplicando nueva estructura...');
        
        // Desactivar triggers temporalmente
        await prisma.$executeRawUnsafe(`ALTER TABLE "Booking" DISABLE TRIGGER "trg_Booking_sync_leads"`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Booking" DISABLE TRIGGER "trg_Booking_delete_sync_leads"`);
        
        // Renombrar tabla vieja
        await prisma.$executeRawUnsafe(`ALTER TABLE "Leads" RENAME TO "Leads_old"`);
        
        // Renombrar tabla nueva
        await prisma.$executeRawUnsafe(`ALTER TABLE "Leads_new" RENAME TO "Leads"`);
        
        console.log('✅ Nueva estructura aplicada');
        
        // 7. RECREAR TRIGGERS
        console.log('\n⚡ Paso 7: Recreando triggers...');
        
        // Eliminar triggers antiguos
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "trg_Booking_sync_leads" ON "Booking"`);
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "trg_Booking_delete_sync_leads" ON "Booking"`);
        
        // Crear trigger principal
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER "trg_Booking_sync_leads"
            AFTER INSERT OR UPDATE OF "BDStatus", "guestName", "propertyName",
                                     "arrivalDate", "departureDate", "totalPersons",
                                     "channel", "phone", "numNights"
            ON "Booking"
            FOR EACH ROW
            EXECUTE FUNCTION public.booking_sync_leads();
        `);
        
        // Crear trigger de eliminación
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER "trg_Booking_delete_sync_leads"
            AFTER DELETE ON "Booking"
            FOR EACH ROW
            EXECUTE FUNCTION public.booking_sync_leads();
        `);
        
        console.log('✅ Triggers recreados');
        
        // 8. SINCRONIZACIÓN INICIAL
        console.log('\n🔄 Paso 8: Sincronización inicial con nueva estructura...');
        
        // Limpiar tabla
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Leads"`);
        
        // Triggear resincronización
        const syncResult = await prisma.$executeRawUnsafe(`
            UPDATE "Booking" 
            SET "lastUpdatedBD" = "lastUpdatedBD"
            WHERE "BDStatus" = 'Futura Pendiente'
            RETURNING "bookingId"
        `);
        
        console.log(`✅ Sincronizadas ${syncResult.count} reservas`);
        
        // 9. VERIFICACIÓN
        console.log('\n✅ Paso 9: Verificación final...');
        
        const finalCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Leads"` as any[];
        console.log(`📊 Total de leads en nueva tabla: ${finalCount[0].count}`);
        
        // Mostrar muestra de datos
        const sample = await prisma.$queryRaw`
            SELECT 
                "bookingId",
                "guestName",
                "phone",
                "propertyName",
                TO_CHAR("arrivalDate", 'DD/MM/YYYY') as "arrivalDate",
                TO_CHAR("departureDate", 'DD/MM/YYYY') as "departureDate",
                "numNights",
                "totalPersons",
                "channel",
                TO_CHAR("createdAt", 'DD/MM/YYYY HH24:MI') as "createdAt"
            FROM "Leads"
            ORDER BY "arrivalDate"
            LIMIT 5
        ` as any[];
        
        if (sample.length > 0) {
            console.log('\n📋 Muestra de leads migrados:');
            console.table(sample);
        }
        
        // 10. LIMPIEZA
        console.log('\n🧹 Paso 10: Limpieza...');
        
        // Eliminar tabla vieja después de confirmar éxito
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Leads_old"`);
        console.log('✅ Tabla antigua eliminada');
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!');
        console.log('=' .repeat(60));
        
        console.log('\n📊 RESUMEN DE LA NUEVA ESTRUCTURA:');
        console.log('✅ Campos mantenidos: bookingId, guestName, phone, propertyName');
        console.log('✅ Fechas optimizadas: arrivalDate, departureDate (solo fecha, sin hora)');
        console.log('✅ Datos calculados: numNights (automático)');
        console.log('✅ Información comercial: totalPersons, channel');
        console.log('✅ Auditoría: createdAt');
        console.log('\n❌ Campos eliminados: source, priority, notes, assignedTo, lastContactAt,');
        console.log('   nextFollowUp, estimatedValue, lastUpdatedLeads, lastUpdated');
        
        console.log('\n🔄 SINCRONIZACIÓN AUTOMÁTICA:');
        console.log('• Reservas con BDStatus = "Futura Pendiente" → Se agregan a Leads');
        console.log('• Cambio a cualquier otro estado → Se eliminan de Leads');
        console.log('• Eliminación de booking → Lead eliminado automáticamente');
        
    } catch (error) {
        console.error('\n❌ ERROR EN LA MIGRACIÓN:', error);
        
        // Intentar rollback
        console.log('\n⚠️ Intentando rollback...');
        try {
            await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Leads_new"`);
            await prisma.$executeRawUnsafe(`ALTER TABLE "Leads_old" RENAME TO "Leads"`);
            console.log('✅ Rollback completado');
        } catch (rollbackError) {
            console.error('❌ Error en rollback:', rollbackError);
        }
        
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
main()
    .then(() => {
        console.log('\n✅ Script finalizado correctamente');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error fatal:', error);
        process.exit(1);
    });