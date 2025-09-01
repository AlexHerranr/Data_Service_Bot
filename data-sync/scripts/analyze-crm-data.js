/**
 * Script para analizar por qué hay pocas reservas en IA_CRM_Clientes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeCRMData() {
    console.log('🔍 ANÁLISIS DE DATOS IA_CRM_Clientes vs Booking');
    console.log('=' .repeat(80));
    
    try {
        // 1. Contar reservas totales en Booking con teléfonos válidos
        const bookingStats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total_bookings,
                COUNT(DISTINCT "phone") as unique_phones,
                COUNT(CASE WHEN "phone" IS NOT NULL AND "phone" != '' AND "phone" != 'unknown' THEN 1 END) as valid_phones,
                COUNT(CASE WHEN "BDStatus" NOT LIKE '%Cancelada%' THEN 1 END) as active_bookings
            FROM "Booking"
        `;
        
        console.log('\n📊 ESTADÍSTICAS DE BOOKING:');
        console.table(bookingStats);
        
        // 2. Contar registros en IA_CRM_Clientes
        const crmStats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total_crm,
                COUNT(DISTINCT "phoneNumber") as unique_phones,
                COUNT(CASE WHEN "bookingId" IS NOT NULL THEN 1 END) as from_booking,
                COUNT(CASE WHEN "source" = 'whatsapp' THEN 1 END) as from_whatsapp
            FROM "IA_CRM_Clientes"
        `;
        
        console.log('\n📊 ESTADÍSTICAS DE IA_CRM_Clientes:');
        console.table(crmStats);
        
        // 3. Analizar teléfonos únicos con reservas activas
        const phoneAnalysis = await prisma.$queryRaw`
            SELECT 
                'Booking (únicos con tel válido)' as source,
                COUNT(DISTINCT "phone") as count
            FROM "Booking"
            WHERE "phone" IS NOT NULL 
                AND "phone" != '' 
                AND "phone" != 'unknown'
                AND "BDStatus" NOT LIKE '%Cancelada%'
            
            UNION ALL
            
            SELECT 
                'IA_CRM_Clientes (total)' as source,
                COUNT(DISTINCT "phoneNumber") as count
            FROM "IA_CRM_Clientes"
        `;
        
        console.log('\n📱 ANÁLISIS DE TELÉFONOS ÚNICOS:');
        console.table(phoneAnalysis);
        
        // 4. Ver distribución por BDStatus en Booking
        const statusDistribution = await prisma.$queryRaw`
            SELECT 
                "BDStatus",
                COUNT(*) as total,
                COUNT(DISTINCT "phone") as unique_phones
            FROM "Booking"
            WHERE "phone" IS NOT NULL 
                AND "phone" != '' 
                AND "phone" != 'unknown'
            GROUP BY "BDStatus"
            ORDER BY COUNT(*) DESC
            LIMIT 15
        `;
        
        console.log('\n📈 DISTRIBUCIÓN POR BDStatus EN BOOKING:');
        console.table(statusDistribution);
        
        // 5. Identificar teléfonos de Booking que NO están en CRM
        const missingPhones = await prisma.$queryRaw`
            SELECT 
                b."phone",
                b."guestName",
                b."BDStatus",
                b."bookingId",
                b."arrivalDate"
            FROM "Booking" b
            LEFT JOIN "IA_CRM_Clientes" c ON b."phone" = c."phoneNumber"
            WHERE c."phoneNumber" IS NULL
                AND b."phone" IS NOT NULL 
                AND b."phone" != '' 
                AND b."phone" != 'unknown'
                AND b."BDStatus" NOT LIKE '%Cancelada%'
            ORDER BY b."arrivalDate" DESC
            LIMIT 10
        `;
        
        console.log('\n⚠️ MUESTRA DE TELÉFONOS FALTANTES EN CRM:');
        console.table(missingPhones);
        
        // 6. Ver si hay duplicados en CRM
        const duplicates = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                COUNT(*) as count
            FROM "IA_CRM_Clientes"
            GROUP BY "phoneNumber"
            HAVING COUNT(*) > 1
        `;
        
        console.log('\n🔄 DUPLICADOS EN CRM:');
        if (duplicates.length > 0) {
            console.table(duplicates);
        } else {
            console.log('✅ No hay duplicados (phoneNumber es único)');
        }
        
        // 7. Verificar triggers activos
        const triggers = await prisma.$queryRaw`
            SELECT 
                trigger_name,
                event_manipulation,
                event_object_table
            FROM information_schema.triggers
            WHERE event_object_table IN ('Booking', 'ClientView')
            AND trigger_name LIKE '%crm%'
        `;
        
        console.log('\n🔧 TRIGGERS ACTIVOS:');
        console.table(triggers);
        
        console.log('\n' + '=' .repeat(80));
        console.log('📋 RESUMEN DEL ANÁLISIS:');
        console.log('=' .repeat(80));
        
        const bookingTotal = bookingStats[0].total_bookings;
        const bookingValidPhones = bookingStats[0].valid_phones;
        const crmTotal = crmStats[0].total_crm;
        
        console.log(`\n• Total reservas en Booking: ${bookingTotal}`);
        console.log(`• Reservas con teléfono válido: ${bookingValidPhones}`);
        console.log(`• Registros en IA_CRM_Clientes: ${crmTotal}`);
        console.log(`• Diferencia: ${bookingValidPhones - crmTotal} registros faltantes`);
        
        if (bookingValidPhones > crmTotal) {
            console.log('\n⚠️ PROBLEMA DETECTADO: Faltan registros en IA_CRM_Clientes');
            console.log('📌 Posibles causas:');
            console.log('   1. La tabla se creó recientemente y necesita sincronización inicial');
            console.log('   2. Los triggers no estaban activos durante algunas inserciones');
            console.log('   3. La lógica de unificación por phoneNumber está agrupando registros');
        }
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
analyzeCRMData()
    .then(() => {
        console.log('\n✅ Análisis completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });