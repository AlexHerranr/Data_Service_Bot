/**
 * Script para migración inicial de datos a Contactos
 * Migra datos existentes desde Booking y ClientView
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrateInitialData() {
    console.log('🔄 MIGRACIÓN INICIAL DE DATOS A CONTACTOS');
    console.log('=' .repeat(60));
    
    try {
        // 1. MIGRAR DATOS DESDE BOOKING (agrupados por teléfono)
        console.log('\n📚 Migrando datos desde Booking...');
        
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
                normalize_phone(b."clientPhone") as phone,
                MAX(b."clientName") as name,
                MAX(b."clientEmail") as email,
                COUNT(*) as total,
                COUNT(CASE WHEN b."BDStatus" IN ('Confirmada', 'Futura Confirmada') THEN 1 END) as confirmed,
                COUNT(CASE WHEN b."BDStatus" = 'Futura Pendiente' THEN 1 END) as pending,
                COUNT(CASE WHEN b."BDStatus" = 'Cancelada' THEN 1 END) as cancelled,
                MAX(CASE WHEN b."checkIn" < CURRENT_DATE THEN b."checkIn" END) as last_checkin,
                MIN(CASE WHEN b."checkIn" >= CURRENT_DATE THEN b."checkIn" END) as next_checkin,
                COALESCE(SUM(b."totalAmount"), 0) as total_spent,
                ARRAY['booking'] as source,
                MAX(COALESCE(b."updatedAt", b."createdAt")) as last_activity,
                'active' as status
            FROM "Booking" b
            WHERE normalize_phone(b."clientPhone") IS NOT NULL
            GROUP BY normalize_phone(b."clientPhone")
            ON CONFLICT ("phoneNumber") DO NOTHING
        `;
        
        console.log(`✅ Migrados ${bookingMigration} contactos desde Booking`);
        
        // 2. ACTUALIZAR CON DATOS DE CLIENTVIEW
        console.log('\n💬 Actualizando con datos de ClientView...');
        
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
        
        console.log(`✅ Actualizados ${clientViewUpdate} contactos con datos de WhatsApp`);
        
        // 3. INSERTAR CONTACTOS QUE SOLO ESTÁN EN CLIENTVIEW
        console.log('\n📱 Insertando contactos solo de WhatsApp...');
        
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
        
        // 4. ACTUALIZAR STATUS AUTOMÁTICAMENTE
        console.log('\n🔄 Actualizando status de todos los contactos...');
        
        await prisma.$executeRaw`
            UPDATE "Contactos"
            SET "status" = CASE
                WHEN "lastActivity" IS NULL OR "lastActivity" < CURRENT_DATE - INTERVAL '365 days' 
                    THEN 'archived'
                WHEN "lastActivity" < CURRENT_DATE - INTERVAL '180 days' 
                    THEN 'inactive'
                ELSE 'active'
            END
        `;
        
        // 5. ESTADÍSTICAS FINALES
        console.log('\n📊 ESTADÍSTICAS POST-MIGRACIÓN:');
        
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total_contactos,
                COUNT(CASE WHEN "hasWhatsapp" = true THEN 1 END) as con_whatsapp,
                COUNT(CASE WHEN "totalBookings" > 0 THEN 1 END) as con_reservas,
                COUNT(CASE WHEN "hasWhatsapp" = true AND "totalBookings" > 0 THEN 1 END) as ambas_fuentes,
                COUNT(CASE WHEN "status" = 'active' THEN 1 END) as activos,
                COUNT(CASE WHEN "status" = 'inactive' THEN 1 END) as inactivos,
                COUNT(CASE WHEN "status" = 'archived' THEN 1 END) as archivados
            FROM "Contactos"
        `;
        
        console.table(stats);
        
        // 6. VALIDACIÓN DE INTEGRIDAD
        console.log('\n✅ Validando integridad de datos...');
        
        const validation = await prisma.$queryRaw`
            SELECT 
                'Booking' as fuente,
                COUNT(DISTINCT normalize_phone("clientPhone")) as telefonos_unicos
            FROM "Booking"
            WHERE normalize_phone("clientPhone") IS NOT NULL
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
        
        console.log('\nValidación de teléfonos únicos:');
        console.table(validation);
        
        // 7. MOSTRAR EJEMPLOS
        console.log('\n📋 Ejemplos de contactos migrados:');
        
        const examples = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "hasWhatsapp",
                "totalBookings",
                "totalSpent",
                "status",
                array_to_string("source", ', ') as sources
            FROM "Contactos"
            ORDER BY "totalSpent" DESC NULLS LAST
            LIMIT 10
        `;
        
        console.table(examples);
        
        // 8. CONTACTOS CON ERRORES
        const errors = await prisma.$queryRaw`
            SELECT COUNT(*) as contactos_con_errores
            FROM "Contactos"
            WHERE "syncErrors" > 0
        `;
        
        if (errors[0].contactos_con_errores > 0) {
            console.log(`\n⚠️ Hay ${errors[0].contactos_con_errores} contactos con errores de sincronización`);
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
        console.log('\nLos triggers están activos para futuras sincronizaciones automáticas');
        
    } catch (error) {
        console.error('❌ Error en migración:', error);
        
        // Log del error
        await prisma.$executeRaw`
            INSERT INTO "ContactosSyncLog" ("source", "action", "success", "error")
            VALUES ('migration', 'initial_migration', false, ${error.message})
        `;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
migrateInitialData();