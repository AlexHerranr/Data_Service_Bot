/**
 * Análisis profundo de por qué faltan registros en IA_CRM_Clientes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deepAnalysisMissing() {
    console.log('🔍 ANÁLISIS PROFUNDO: ¿Por qué faltan registros?');
    console.log('=' .repeat(80));
    
    try {
        // 1. Verificar cuántos teléfonos únicos realmente hay
        console.log('\n📱 ANÁLISIS DE TELÉFONOS EN BOOKING:');
        
        const phoneAnalysis = await prisma.$queryRaw`
            WITH phone_stats AS (
                SELECT 
                    "phone",
                    COUNT(*) as reservas_por_telefono,
                    STRING_AGG(DISTINCT "BDStatus", ', ') as estados,
                    MIN("arrivalDate") as primera_reserva,
                    MAX("arrivalDate") as ultima_reserva
                FROM "Booking"
                WHERE "phone" IS NOT NULL 
                    AND "phone" != '' 
                    AND "phone" != 'unknown'
                GROUP BY "phone"
            )
            SELECT 
                CASE 
                    WHEN reservas_por_telefono = 1 THEN '1 reserva'
                    WHEN reservas_por_telefono = 2 THEN '2 reservas'
                    WHEN reservas_por_telefono >= 3 AND reservas_por_telefono <= 5 THEN '3-5 reservas'
                    ELSE '6+ reservas'
                END as grupo,
                COUNT(*) as telefonos_unicos,
                SUM(reservas_por_telefono) as total_reservas
            FROM phone_stats
            GROUP BY 
                CASE 
                    WHEN reservas_por_telefono = 1 THEN '1 reserva'
                    WHEN reservas_por_telefono = 2 THEN '2 reservas'
                    WHEN reservas_por_telefono >= 3 AND reservas_por_telefono <= 5 THEN '3-5 reservas'
                    ELSE '6+ reservas'
                END
            ORDER BY 
                MIN(reservas_por_telefono)
        `;
        
        console.log('\nDistribución de reservas por teléfono:');
        console.table(phoneAnalysis);
        
        // 2. Ver teléfonos con más reservas
        const topPhones = await prisma.$queryRaw`
            SELECT 
                "phone",
                COUNT(*) as num_reservas,
                STRING_AGG(DISTINCT "BDStatus", ', ') as estados,
                MIN("guestName") as nombre_ejemplo
            FROM "Booking"
            WHERE "phone" IS NOT NULL 
                AND "phone" != '' 
                AND "phone" != 'unknown'
            GROUP BY "phone"
            HAVING COUNT(*) > 3
            ORDER BY COUNT(*) DESC
            LIMIT 10
        `;
        
        console.log('\n📊 TOP 10 teléfonos con más reservas:');
        console.table(topPhones);
        
        // 3. Verificar teléfonos únicos NO cancelados
        const activePhones = await prisma.$queryRaw`
            SELECT 
                COUNT(DISTINCT "phone") as telefonos_unicos_activos
            FROM "Booking"
            WHERE "phone" IS NOT NULL 
                AND "phone" != '' 
                AND "phone" != 'unknown'
                AND ("BDStatus" NOT LIKE '%Cancelada%' OR "BDStatus" IS NULL)
        `;
        
        console.log('\n✅ Teléfonos únicos con reservas NO canceladas:');
        console.table(activePhones);
        
        // 4. Verificar qué teléfonos NO están en CRM
        console.log('\n⚠️ VERIFICANDO TELÉFONOS FALTANTES:');
        
        const missingAnalysis = await prisma.$queryRaw`
            WITH booking_phones AS (
                SELECT DISTINCT 
                    "phone",
                    MIN("guestName") as nombre,
                    COUNT(*) as num_reservas,
                    MAX("BDStatus") as ultimo_estado
                FROM "Booking"
                WHERE "phone" IS NOT NULL 
                    AND "phone" != '' 
                    AND "phone" != 'unknown'
                GROUP BY "phone"
            )
            SELECT 
                COUNT(*) FILTER (WHERE c."phoneNumber" IS NULL) as faltantes_en_crm,
                COUNT(*) FILTER (WHERE c."phoneNumber" IS NOT NULL) as existentes_en_crm,
                COUNT(*) as total_telefonos_unicos
            FROM booking_phones b
            LEFT JOIN "IA_CRM_Clientes" c ON b."phone" = c."phoneNumber"
        `;
        
        console.table(missingAnalysis);
        
        // 5. Muestra de teléfonos que faltan
        const missingSample = await prisma.$queryRaw`
            WITH booking_phones AS (
                SELECT DISTINCT 
                    "phone",
                    MIN("guestName") as nombre,
                    COUNT(*) as num_reservas,
                    MAX("BDStatus") as ultimo_estado,
                    MAX("arrivalDate") as ultima_llegada
                FROM "Booking"
                WHERE "phone" IS NOT NULL 
                    AND "phone" != '' 
                    AND "phone" != 'unknown'
                GROUP BY "phone"
            )
            SELECT 
                b."phone",
                b.nombre,
                b.num_reservas,
                b.ultimo_estado,
                b.ultima_llegada
            FROM booking_phones b
            LEFT JOIN "IA_CRM_Clientes" c ON b."phone" = c."phoneNumber"
            WHERE c."phoneNumber" IS NULL
            ORDER BY b.num_reservas DESC, b.ultima_llegada DESC
            LIMIT 20
        `;
        
        if (missingSample.length > 0) {
            console.log('\n🔴 MUESTRA DE TELÉFONOS QUE FALTAN EN CRM:');
            console.table(missingSample);
            
            // Verificar si hay algún patrón en los faltantes
            const firstMissing = missingSample[0];
            console.log('\n🔍 Investigando el primer teléfono faltante:', firstMissing.phone);
            
            const detailCheck = await prisma.$queryRaw`
                SELECT 
                    "bookingId",
                    "guestName",
                    "phone",
                    "BDStatus",
                    "arrivalDate",
                    "createdAt"
                FROM "Booking"
                WHERE "phone" = ${firstMissing.phone}
                ORDER BY "arrivalDate" DESC
                LIMIT 5
            `;
            
            console.log('Reservas de este teléfono:');
            console.table(detailCheck);
        }
        
        // 6. Verificar si el problema es con los triggers
        console.log('\n🔧 VERIFICANDO TRIGGERS:');
        const triggerCheck = await prisma.$queryRaw`
            SELECT 
                trigger_name,
                event_manipulation,
                action_timing,
                action_orientation
            FROM information_schema.triggers
            WHERE event_object_table = 'Booking'
            AND trigger_name LIKE '%crm%'
        `;
        console.table(triggerCheck);
        
        // 7. Contar registros por fecha de creación
        console.log('\n📅 ANÁLISIS TEMPORAL:');
        const temporalAnalysis = await prisma.$queryRaw`
            SELECT 
                DATE("createdAt") as fecha,
                COUNT(*) as reservas_creadas
            FROM "Booking"
            WHERE "phone" IS NOT NULL 
                AND "phone" != '' 
                AND "phone" != 'unknown'
            GROUP BY DATE("createdAt")
            ORDER BY DATE("createdAt") DESC
            LIMIT 10
        `;
        console.table(temporalAnalysis);
        
        // 8. Resumen final
        console.log('\n' + '=' .repeat(80));
        console.log('📊 RESUMEN DEL PROBLEMA:');
        console.log('=' .repeat(80));
        
        const summary = await prisma.$queryRaw`
            SELECT 
                (SELECT COUNT(DISTINCT "phone") FROM "Booking" 
                 WHERE "phone" IS NOT NULL AND "phone" != '' AND "phone" != 'unknown') as telefonos_unicos_booking,
                (SELECT COUNT(DISTINCT "phoneNumber") FROM "IA_CRM_Clientes") as telefonos_en_crm,
                (SELECT COUNT(DISTINCT "phone") FROM "Booking" 
                 WHERE "phone" IS NOT NULL AND "phone" != '' AND "phone" != 'unknown'
                 AND "phone" NOT IN (SELECT "phoneNumber" FROM "IA_CRM_Clientes")) as telefonos_faltantes
        `;
        
        console.table(summary);
        
        const stats = summary[0];
        if (stats.telefonos_faltantes > 0) {
            console.log('\n⚠️ HAY TELÉFONOS QUE NO ESTÁN EN CRM');
            console.log('📌 Esto indica que:');
            console.log('1. Los triggers se crearon DESPUÉS de que ya existían reservas');
            console.log('2. Necesitamos hacer una sincronización inicial masiva');
            console.log('\n✅ SOLUCIÓN: Ejecutar sincronización completa de todos los teléfonos faltantes');
        }
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
deepAnalysisMissing()
    .then(() => {
        console.log('\n✅ Análisis completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });