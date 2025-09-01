/**
 * Script de migración corregido con nombres de columnas correctos
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrateInitialData() {
    console.log('🔄 MIGRACIÓN INICIAL DE DATOS A CONTACTOS');
    console.log('=' .repeat(60));
    
    try {
        // 1. MIGRAR DATOS DESDE BOOKING
        console.log('\n📚 [1/5] Migrando datos desde Booking...');
        
        const bookingMigration = await prisma.$executeRaw`
            INSERT INTO "Contactos" (
                "phoneNumber",
                "name",
                "email",
                "totalBookings",
                "confirmedBookings",
                "pendingBookings",
                "cancelledBookings",
                "lastCheckIn",
                "nextCheckIn",
                "totalSpent",
                "source",
                "lastActivity",
                "status"
            )
            SELECT 
                normalize_phone(b."phone") as phone,
                MAX(b."guestName") as name,
                MAX(b."email") as email,
                COUNT(*) as total,
                COUNT(CASE WHEN b."BDStatus" IN ('Confirmada', 'Futura Confirmada') THEN 1 END) as confirmed,
                COUNT(CASE WHEN b."BDStatus" = 'Futura Pendiente' THEN 1 END) as pending,
                COUNT(CASE WHEN b."BDStatus" = 'Cancelada' THEN 1 END) as cancelled,
                MAX(CASE WHEN b."arrivalDate" < CURRENT_DATE THEN b."arrivalDate" END) as last_checkin,
                MIN(CASE WHEN b."arrivalDate" >= CURRENT_DATE THEN b."arrivalDate" END) as next_checkin,
                COALESCE(SUM(b."totalAmount"), 0) as total_spent,
                ARRAY['booking'] as source,
                MAX(b."lastUpdatedBD") as last_activity,
                'active' as status
            FROM "Booking" b
            WHERE normalize_phone(b."phone") IS NOT NULL
            GROUP BY normalize_phone(b."phone")
            ON CONFLICT ("phoneNumber") DO NOTHING
        `;
        
        console.log(`✅ Migrados ${bookingMigration} contactos desde Booking`);
        
        // 2. ACTUALIZAR CON DATOS DE CLIENTVIEW
        console.log('\n💬 [2/5] Actualizando con datos de ClientView...');
        
        const clientViewUpdate = await prisma.$executeRaw`
            UPDATE "Contactos" c
            SET 
                "name" = get_best_name(c."name", cv."name"),
                "whatsappChatId" = cv."chatId",
                "whatsappLabels" = cv."labels",
                "lastWhatsappMsg" = cv."lastActivity",
                "hasWhatsapp" = true,
                "source" = CASE 
                    WHEN 'whatsapp' = ANY(c."source") 
                    THEN c."source"
                    ELSE array_append(c."source", 'whatsapp')
                END,
                "lastActivity" = GREATEST(c."lastActivity", cv."lastActivity"),
                "updatedAt" = NOW()
            FROM "ClientView" cv
            WHERE normalize_phone(cv."phoneNumber") = c."phoneNumber"
        `;
        
        console.log(`✅ Actualizados ${clientViewUpdate} contactos con WhatsApp`);
        
        // 3. INSERTAR CONTACTOS SOLO DE WHATSAPP
        console.log('\n📱 [3/5] Insertando contactos solo de WhatsApp...');
        
        const whatsappOnly = await prisma.$executeRaw`
            INSERT INTO "Contactos" (
                "phoneNumber",
                "name",
                "whatsappChatId",
                "whatsappLabels",
                "lastWhatsappMsg",
                "hasWhatsapp",
                "source",
                "lastActivity",
                "status"
            )
            SELECT 
                normalize_phone(cv."phoneNumber"),
                cv."name",
                cv."chatId",
                cv."labels",
                cv."lastActivity",
                true,
                ARRAY['whatsapp'],
                cv."lastActivity",
                'active'
            FROM "ClientView" cv
            WHERE normalize_phone(cv."phoneNumber") IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM "Contactos" c 
                WHERE c."phoneNumber" = normalize_phone(cv."phoneNumber")
            )
        `;
        
        console.log(`✅ Insertados ${whatsappOnly} contactos solo de WhatsApp`);
        
        // 4. ACTUALIZAR STATUS
        console.log('\n🔄 [4/5] Actualizando status de contactos...');
        
        const statusUpdate = await prisma.$executeRaw`
            UPDATE "Contactos"
            SET "status" = CASE
                WHEN "lastActivity" IS NULL OR "lastActivity" < CURRENT_DATE - INTERVAL '365 days' 
                    THEN 'archived'
                WHEN "lastActivity" < CURRENT_DATE - INTERVAL '180 days' 
                    THEN 'inactive'
                ELSE 'active'
            END
        `;
        
        console.log(`✅ Status actualizado para ${statusUpdate} contactos`);
        
        // 5. ESTADÍSTICAS FINALES
        console.log('\n📊 [5/5] Generando estadísticas...');
        
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total_contactos,
                COUNT(CASE WHEN "hasWhatsapp" = true THEN 1 END) as con_whatsapp,
                COUNT(CASE WHEN "totalBookings" > 0 THEN 1 END) as con_reservas,
                COUNT(CASE WHEN "hasWhatsapp" = true AND "totalBookings" > 0 THEN 1 END) as ambas_fuentes,
                COUNT(CASE WHEN "status" = 'active' THEN 1 END) as activos,
                COUNT(CASE WHEN "status" = 'inactive' THEN 1 END) as inactivos,
                COUNT(CASE WHEN "status" = 'archived' THEN 1 END) as archivados,
                SUM("totalBookings") as total_reservas_acumuladas,
                ROUND(AVG("totalBookings"), 2) as promedio_reservas_por_contacto
            FROM "Contactos"
        `;
        
        console.log('\n' + '=' .repeat(60));
        console.log('📊 RESUMEN DE MIGRACIÓN:');
        console.table(stats);
        
        // Validación
        const validation = await prisma.$queryRaw`
            SELECT 
                'Booking' as fuente,
                COUNT(DISTINCT normalize_phone("phone")) as telefonos_unicos
            FROM "Booking"
            WHERE normalize_phone("phone") IS NOT NULL
            UNION ALL
            SELECT 
                'ClientView' as fuente,
                COUNT(DISTINCT normalize_phone("phoneNumber")) as telefonos_unicos
            FROM "ClientView"
            WHERE normalize_phone("phoneNumber") IS NOT NULL
            UNION ALL
            SELECT 
                'Contactos' as fuente,
                COUNT(DISTINCT "phoneNumber") as telefonos_unicos
            FROM "Contactos"
        `;
        
        console.log('\n✅ Validación de integridad:');
        console.table(validation);
        
        // Top clientes
        const topClients = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "hasWhatsapp",
                "totalBookings",
                "confirmedBookings",
                TO_CHAR("totalSpent", 'FM$999,999,999') as total_gastado,
                "status",
                array_to_string("source", ', ') as fuentes
            FROM "Contactos"
            WHERE "totalBookings" > 0
            ORDER BY "totalSpent" DESC NULLS LAST
            LIMIT 10
        `;
        
        console.log('\n💎 Top 10 clientes por valor:');
        console.table(topClients);
        
        // Leads de WhatsApp
        const whatsappLeads = await prisma.$queryRaw`
            SELECT COUNT(*) as leads_whatsapp_sin_reservas
            FROM "Contactos"
            WHERE "hasWhatsapp" = true
            AND "totalBookings" = 0
        `;
        
        console.log(`\n📱 Leads de WhatsApp sin reservas: ${whatsappLeads[0].leads_whatsapp_sin_reservas}`);
        
        // También actualizar triggers con nombres correctos
        console.log('\n🔧 Actualizando trigger de Booking con columnas correctas...');
        
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION sync_booking_to_contactos()
            RETURNS TRIGGER AS $$
            DECLARE
                v_normalized_phone TEXT;
            BEGIN
                v_normalized_phone := normalize_phone(NEW."phone");
                IF v_normalized_phone IS NULL THEN
                    RAISE WARNING 'Teléfono inválido en Booking: %', NEW."phone";
                    RETURN NEW;
                END IF;
                
                INSERT INTO "Contactos" (
                    "phoneNumber", "name", "email",
                    "totalBookings", "confirmedBookings", "pendingBookings", "cancelledBookings",
                    "lastCheckIn", "nextCheckIn", "totalSpent",
                    "source", "lastActivity", "status"
                )
                VALUES (
                    v_normalized_phone,
                    NEW."guestName",
                    NEW."email",
                    1,
                    CASE WHEN NEW."BDStatus" IN ('Confirmada', 'Futura Confirmada') THEN 1 ELSE 0 END,
                    CASE WHEN NEW."BDStatus" = 'Futura Pendiente' THEN 1 ELSE 0 END,
                    CASE WHEN NEW."BDStatus" = 'Cancelada' THEN 1 ELSE 0 END,
                    CASE WHEN NEW."arrivalDate" < CURRENT_DATE THEN NEW."arrivalDate" ELSE NULL END,
                    CASE WHEN NEW."arrivalDate" >= CURRENT_DATE THEN NEW."arrivalDate" ELSE NULL END,
                    COALESCE(NEW."totalAmount", 0),
                    ARRAY['booking'],
                    NEW."lastUpdatedBD",
                    'active'
                )
                ON CONFLICT ("phoneNumber") DO UPDATE SET
                    "name" = get_best_name("Contactos"."name", EXCLUDED."name"),
                    "email" = COALESCE("Contactos"."email", EXCLUDED."email"),
                    "totalBookings" = "Contactos"."totalBookings" + 1,
                    "confirmedBookings" = "Contactos"."confirmedBookings" + 
                        CASE WHEN NEW."BDStatus" IN ('Confirmada', 'Futura Confirmada') THEN 1 ELSE 0 END,
                    "pendingBookings" = "Contactos"."pendingBookings" + 
                        CASE WHEN NEW."BDStatus" = 'Futura Pendiente' THEN 1 ELSE 0 END,
                    "cancelledBookings" = "Contactos"."cancelledBookings" + 
                        CASE WHEN NEW."BDStatus" = 'Cancelada' THEN 1 ELSE 0 END,
                    "lastCheckIn" = CASE 
                        WHEN NEW."arrivalDate" < CURRENT_DATE THEN 
                            GREATEST("Contactos"."lastCheckIn", NEW."arrivalDate")
                        ELSE "Contactos"."lastCheckIn"
                    END,
                    "nextCheckIn" = CASE 
                        WHEN NEW."arrivalDate" >= CURRENT_DATE THEN
                            LEAST("Contactos"."nextCheckIn", NEW."arrivalDate")
                        ELSE "Contactos"."nextCheckIn"
                    END,
                    "totalSpent" = "Contactos"."totalSpent" + COALESCE(NEW."totalAmount", 0),
                    "source" = CASE 
                        WHEN 'booking' = ANY("Contactos"."source") 
                        THEN "Contactos"."source"
                        ELSE array_append("Contactos"."source", 'booking')
                    END,
                    "lastActivity" = GREATEST("Contactos"."lastActivity", NEW."lastUpdatedBD"),
                    "updatedAt" = NOW();
                
                RETURN NEW;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING 'Error sincronizando Booking ID %: %', NEW."id", SQLERRM;
                    RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `;
        
        console.log('✅ Trigger actualizado con columnas correctas');
        
        console.log('\n' + '=' .repeat(60));
        console.log('✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
        console.log('\n📌 Los triggers están activos para sincronización automática');
        console.log('📌 Tabla Contactos lista para uso en producción');
        
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        
        // Log del error
        try {
            await prisma.$executeRaw`
                INSERT INTO "ContactosSyncLog" ("source", "action", "success", "error")
                VALUES ('migration', 'initial_migration', false, ${error.message})
            `;
        } catch (e) {
            // Ignorar si no existe tabla de logs
        }
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
migrateInitialData();