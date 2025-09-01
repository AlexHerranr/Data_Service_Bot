/**
 * Script para sincronizar solo los leads desde Bookings
 * (La tabla ya fue creada, solo falta llenarla)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncLeads() {
    console.log('🔄 SINCRONIZANDO LEADS DESDE BOOKINGS');
    console.log('=' .repeat(60));
    
    try {
        // 1. Verificar estado actual
        console.log('\n📊 Estado actual:');
        const currentCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Leads"`;
        console.log(`   Leads actuales: ${currentCount[0].count}`);
        
        // 2. Contar reservas pendientes
        const pendingCount = await prisma.$queryRaw`
            SELECT COUNT(*) as count 
            FROM "Booking" 
            WHERE "BDStatus" = 'Futura Pendiente'
        `;
        console.log(`   Reservas "Futura Pendiente": ${pendingCount[0].count}`);
        
        // 3. Sincronizar con query simplificado (sin EXTRACT problemático)
        console.log('\n📥 Insertando leads...');
        
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
                CASE 
                    WHEN "numNights" IS NOT NULL THEN "numNights"
                    WHEN "departureDate" IS NOT NULL AND "arrivalDate" IS NOT NULL 
                        THEN DATE_PART('day', "departureDate"::date - "arrivalDate"::date)::integer
                    ELSE 1
                END as "numNights",
                COALESCE("totalPersons", 1),
                COALESCE("channel", 'Direct')
            FROM "Booking"
            WHERE "BDStatus" = 'Futura Pendiente'
              AND "bookingId" IS NOT NULL
            ON CONFLICT ("bookingId") DO NOTHING
        `);
        
        console.log('✅ Inserción completada');
        
        // 4. Verificar resultados
        console.log('\n📊 RESULTADOS:');
        
        const finalCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Leads"`;
        console.log(`   Total Leads: ${finalCount[0].count}`);
        
        // 5. Mostrar muestra
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
            console.log('\n📋 Primeros 10 leads:');
            console.table(sample);
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎉 ¡SINCRONIZACIÓN COMPLETADA!');
        console.log('=' .repeat(60));
        
    } catch (error) {
        console.error('\n❌ ERROR:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
syncLeads()
    .then(() => {
        console.log('\n✅ Script completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error fatal:', error);
        process.exit(1);
    });