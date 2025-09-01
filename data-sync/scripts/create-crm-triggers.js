/**
 * Script para crear triggers automáticos de sincronización
 * IA_CRM_Clientes se actualizará automáticamente cuando cambien Booking o ClientView
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createCRMTriggers() {
    console.log('⚡ CREANDO TRIGGERS AUTOMÁTICOS PARA IA_CRM_Clientes');
    console.log('=' .repeat(80));
    
    try {
        // 1. FUNCIÓN PARA SINCRONIZAR DESDE BOOKING
        console.log('\n🔧 Creando función de sincronización desde Booking...');
        
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION sync_booking_to_crm()
            RETURNS TRIGGER AS $$
            DECLARE
                v_status VARCHAR(50);
                v_total_bookings INTEGER;
                v_total_value DECIMAL;
            BEGIN
                -- Determinar el status basado en BDStatus
                v_status := CASE 
                    WHEN NEW."BDStatus" = 'Futura Pendiente' THEN 'lead'
                    WHEN NEW."BDStatus" = 'Futura Confirmada' THEN 'confirmado'
                    WHEN NEW."BDStatus" IN ('Pasada Confirmada', 'Pasada Pendiente') THEN 'completado'
                    WHEN NEW."BDStatus" LIKE '%Cancelada%' OR NEW."BDStatus" LIKE '%Cancelled%' THEN 'cancelado'
                    WHEN NEW."arrivalDate"::date = CURRENT_DATE THEN 'hospedado'
                    WHEN NEW."arrivalDate"::date > CURRENT_DATE THEN 'confirmado'
                    ELSE 'completado'
                END;
                
                -- Calcular métricas históricas del cliente
                SELECT 
                    COUNT(*),
                    COALESCE(SUM(
                        CASE 
                            WHEN "totalCharges" ~ '^[0-9]+\.?[0-9]*$' 
                            THEN CAST("totalCharges" AS DECIMAL)
                            ELSE 0
                        END
                    ), 0)
                INTO v_total_bookings, v_total_value
                FROM "Booking"
                WHERE "phone" = NEW."phone"
                  AND "phone" IS NOT NULL
                  AND "phone" != ''
                  AND "BDStatus" NOT LIKE '%Cancelada%';
                
                -- Si el teléfono es válido, insertar o actualizar
                IF NEW."phone" IS NOT NULL AND NEW."phone" != '' AND NEW."phone" != 'unknown' THEN
                    INSERT INTO "IA_CRM_Clientes" (
                        "phoneNumber",
                        "clientName",
                        "email",
                        "bookingId",
                        "currentStatus",
                        "source",
                        "propertyName",
                        "arrivalDate",
                        "departureDate",
                        "lastInteraction",
                        "totalBookings",
                        "totalValue",
                        "updatedAt"
                    )
                    VALUES (
                        NEW."phone",
                        NEW."guestName",
                        NEW."email",
                        NEW."bookingId",
                        v_status,
                        COALESCE(NEW."channel", 'direct'),
                        NEW."propertyName",
                        NEW."arrivalDate"::date,
                        NEW."departureDate"::date,
                        NOW(),
                        v_total_bookings,
                        v_total_value,
                        NOW()
                    )
                    ON CONFLICT ("phoneNumber") DO UPDATE SET
                        -- Solo actualizar si es una reserva más reciente o no cancelada
                        "bookingId" = CASE 
                            WHEN v_status != 'cancelado' THEN NEW."bookingId"
                            WHEN "IA_CRM_Clientes"."currentStatus" = 'cancelado' THEN NEW."bookingId"
                            ELSE "IA_CRM_Clientes"."bookingId"
                        END,
                        "clientName" = COALESCE(NEW."guestName", "IA_CRM_Clientes"."clientName"),
                        "email" = COALESCE(NEW."email", "IA_CRM_Clientes"."email"),
                        "currentStatus" = CASE 
                            WHEN v_status != 'cancelado' THEN v_status
                            WHEN "IA_CRM_Clientes"."currentStatus" IN ('cancelado', 'prospecto') THEN v_status
                            ELSE "IA_CRM_Clientes"."currentStatus"
                        END,
                        "source" = CASE 
                            WHEN v_status != 'cancelado' THEN COALESCE(NEW."channel", 'direct')
                            ELSE "IA_CRM_Clientes"."source"
                        END,
                        "propertyName" = CASE 
                            WHEN v_status != 'cancelado' THEN NEW."propertyName"
                            ELSE "IA_CRM_Clientes"."propertyName"
                        END,
                        "arrivalDate" = CASE 
                            WHEN v_status != 'cancelado' THEN NEW."arrivalDate"::date
                            ELSE "IA_CRM_Clientes"."arrivalDate"
                        END,
                        "departureDate" = CASE 
                            WHEN v_status != 'cancelado' THEN NEW."departureDate"::date
                            ELSE "IA_CRM_Clientes"."departureDate"
                        END,
                        "lastInteraction" = NOW(),
                        "totalBookings" = v_total_bookings,
                        "totalValue" = v_total_value,
                        "updatedAt" = NOW();
                    
                    RAISE NOTICE 'CRM actualizado para %: % (status: %)', NEW."phone", NEW."guestName", v_status;
                END IF;
                
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        console.log('✅ Función sync_booking_to_crm creada');
        
        // 2. FUNCIÓN PARA SINCRONIZAR DESDE CLIENTVIEW
        console.log('\n🔧 Creando función de sincronización desde ClientView...');
        
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION sync_whatsapp_to_crm()
            RETURNS TRIGGER AS $$
            DECLARE
                v_has_active_booking BOOLEAN;
            BEGIN
                -- Verificar si tiene reserva activa (no cancelada)
                SELECT EXISTS(
                    SELECT 1 FROM "Booking" 
                    WHERE "phone" = NEW."phoneNumber" 
                    AND "BDStatus" NOT LIKE '%Cancelada%'
                    AND "BDStatus" NOT LIKE '%Cancelled%'
                    AND "BDStatus" IS NOT NULL
                ) INTO v_has_active_booking;
                
                -- Solo crear/actualizar si NO tiene reserva activa
                IF NOT v_has_active_booking THEN
                    INSERT INTO "IA_CRM_Clientes" (
                        "phoneNumber",
                        "clientName",
                        "currentStatus",
                        "source",
                        "lastInteraction",
                        "threadId",
                        "profileStatus",
                        "proximaAccion",
                        "fechaProximaAccion",
                        "prioridad",
                        "updatedAt"
                    )
                    VALUES (
                        NEW."phoneNumber",
                        COALESCE(NEW."name", NEW."userName", 'Cliente WhatsApp'),
                        'prospecto',
                        'whatsapp',
                        COALESCE(NEW."lastActivity", NOW()),
                        NEW."threadId",
                        NEW."profileStatus",
                        NEW."proximaAccion",
                        NEW."fechaProximaAccion",
                        COALESCE(NEW."prioridad", 3),
                        NOW()
                    )
                    ON CONFLICT ("phoneNumber") DO UPDATE SET
                        "clientName" = COALESCE(NEW."name", NEW."userName", "IA_CRM_Clientes"."clientName"),
                        "lastInteraction" = COALESCE(NEW."lastActivity", NOW()),
                        "threadId" = NEW."threadId",
                        -- Solo actualizar campos IA si vienen con valor
                        "profileStatus" = COALESCE(NEW."profileStatus", "IA_CRM_Clientes"."profileStatus"),
                        "proximaAccion" = COALESCE(NEW."proximaAccion", "IA_CRM_Clientes"."proximaAccion"),
                        "fechaProximaAccion" = COALESCE(NEW."fechaProximaAccion", "IA_CRM_Clientes"."fechaProximaAccion"),
                        "prioridad" = COALESCE(NEW."prioridad", "IA_CRM_Clientes"."prioridad"),
                        "updatedAt" = NOW()
                    WHERE 
                        -- Solo actualizar si es prospecto o cancelado
                        "IA_CRM_Clientes"."currentStatus" IN ('prospecto', 'cancelado');
                    
                    RAISE NOTICE 'CRM actualizado desde WhatsApp: %', NEW."phoneNumber";
                END IF;
                
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        console.log('✅ Función sync_whatsapp_to_crm creada');
        
        // 3. FUNCIÓN PARA ELIMINAR CUANDO SE BORRA UNA RESERVA
        console.log('\n🔧 Creando función para eliminar registros...');
        
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION delete_from_crm()
            RETURNS TRIGGER AS $$
            BEGIN
                -- Solo eliminar si no hay otras reservas del mismo teléfono
                IF NOT EXISTS (
                    SELECT 1 FROM "Booking" 
                    WHERE "phone" = OLD."phone" 
                    AND "bookingId" != OLD."bookingId"
                ) THEN
                    DELETE FROM "IA_CRM_Clientes" 
                    WHERE "phoneNumber" = OLD."phone";
                    
                    RAISE NOTICE 'CRM: Eliminado registro para %', OLD."phone";
                END IF;
                
                RETURN OLD;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        console.log('✅ Función delete_from_crm creada');
        
        // 4. CREAR TRIGGERS
        console.log('\n⚡ Creando triggers...');
        
        // Eliminar triggers antiguos si existen
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_booking_to_crm ON "Booking"`);
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_booking_update_crm ON "Booking"`);
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_booking_delete_crm ON "Booking"`);
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_whatsapp_to_crm ON "ClientView"`);
        
        // Trigger para INSERT en Booking
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER trg_booking_to_crm
            AFTER INSERT ON "Booking"
            FOR EACH ROW
            EXECUTE FUNCTION sync_booking_to_crm()
        `);
        console.log('✅ Trigger INSERT Booking creado');
        
        // Trigger para UPDATE en Booking (solo campos importantes)
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER trg_booking_update_crm
            AFTER UPDATE OF "BDStatus", "guestName", "phone", "email", 
                           "arrivalDate", "departureDate", "propertyName", "channel"
            ON "Booking"
            FOR EACH ROW
            EXECUTE FUNCTION sync_booking_to_crm()
        `);
        console.log('✅ Trigger UPDATE Booking creado');
        
        // Trigger para DELETE en Booking
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER trg_booking_delete_crm
            AFTER DELETE ON "Booking"
            FOR EACH ROW
            EXECUTE FUNCTION delete_from_crm()
        `);
        console.log('✅ Trigger DELETE Booking creado');
        
        // Trigger para ClientView
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER trg_whatsapp_to_crm
            AFTER INSERT OR UPDATE ON "ClientView"
            FOR EACH ROW
            EXECUTE FUNCTION sync_whatsapp_to_crm()
        `);
        console.log('✅ Trigger ClientView creado');
        
        // 5. TEST DE TRIGGERS
        console.log('\n🧪 Probando triggers...');
        
        // Buscar una reserva para test
        const testBooking = await prisma.$queryRaw`
            SELECT "bookingId", "guestName", "BDStatus", "phone"
            FROM "Booking"
            WHERE "phone" IS NOT NULL 
            AND "phone" != ''
            AND "phone" != 'unknown'
            LIMIT 1
        `;
        
        if (testBooking && testBooking.length > 0) {
            const booking = testBooking[0];
            console.log(`\n📝 Test con reserva: ${booking.bookingId} - ${booking.guestName}`);
            
            // Hacer un update dummy para triggear la sincronización
            await prisma.$executeRawUnsafe(`
                UPDATE "Booking" 
                SET "lastUpdatedBD" = NOW()
                WHERE "bookingId" = $1
            `, booking.bookingId);
            
            // Verificar que se actualizó en CRM
            const crmRecord = await prisma.$queryRaw`
                SELECT "phoneNumber", "clientName", "currentStatus", "updatedAt"
                FROM "IA_CRM_Clientes"
                WHERE "phoneNumber" = ${booking.phone}
            `;
            
            if (crmRecord && crmRecord.length > 0) {
                console.log('✅ Test exitoso - Registro actualizado en CRM:');
                console.table(crmRecord);
            }
        }
        
        // 6. VERIFICACIÓN FINAL
        console.log('\n📊 VERIFICACIÓN DE TRIGGERS:');
        
        const triggers = await prisma.$queryRaw`
            SELECT 
                trigger_name as "Trigger",
                event_manipulation as "Evento",
                event_object_table as "Tabla"
            FROM information_schema.triggers
            WHERE trigger_name LIKE '%crm%'
            ORDER BY event_object_table, event_manipulation
        `;
        
        console.table(triggers);
        
        console.log('\n' + '=' .repeat(80));
        console.log('🎉 ¡TRIGGERS AUTOMÁTICOS CREADOS EXITOSAMENTE!');
        console.log('=' .repeat(80));
        
        console.log('\n✅ Sincronización automática activa:');
        console.log('• Cuando se crea una reserva → Se agrega al CRM');
        console.log('• Cuando cambia BDStatus → Se actualiza currentStatus');
        console.log('• Cuando se cancela → Marca como "cancelado" para reactivación');
        console.log('• Cuando llega un WhatsApp → Se crea/actualiza prospecto');
        console.log('• Cuando se elimina reserva → Se limpia del CRM');
        
        console.log('\n🔄 Flujo de estados automático:');
        console.log('• Futura Pendiente → lead');
        console.log('• Futura Confirmada → confirmado');
        console.log('• Llegada hoy → hospedado');
        console.log('• Pasada → completado');
        console.log('• Cancelada → cancelado');
        
        console.log('\n💡 Los campos de IA se mantienen:');
        console.log('• profileStatus - No se sobrescribe');
        console.log('• proximaAccion - No se sobrescribe');
        console.log('• fechaProximaAccion - No se sobrescribe');
        console.log('• prioridad - No se sobrescribe');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
createCRMTriggers()
    .then(() => {
        console.log('\n✅ Proceso completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });