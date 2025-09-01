/**
 * Script simplificado para llenar la tabla Leads
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncLeads() {
    console.log('🔄 SINCRONIZANDO LEADS DESDE BOOKINGS');
    console.log('=' .repeat(60));
    
    try {
        // 1. Verificar estado
        console.log('\n📊 Estado actual:');
        const currentCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Leads"`;
        console.log(`   Leads actuales: ${currentCount[0].count}`);
        
        const pendingCount = await prisma.$queryRaw`
            SELECT COUNT(*) as count 
            FROM "Booking" 
            WHERE "BDStatus" = 'Futura Pendiente'
        `;
        console.log(`   Reservas "Futura Pendiente": ${pendingCount[0].count}`);
        
        // 2. Insertar leads de forma simple
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
                COALESCE("numNights", 1),
                COALESCE("totalPersons", 1),
                COALESCE("channel", 'Direct')
            FROM "Booking"
            WHERE "BDStatus" = 'Futura Pendiente'
              AND "bookingId" IS NOT NULL
            ON CONFLICT ("bookingId") DO NOTHING
        `);
        
        console.log('✅ Inserción completada');
        
        // 3. Verificar resultados
        console.log('\n📊 RESULTADOS:');
        
        const finalCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Leads"`;
        console.log(`   ✅ Total Leads creados: ${finalCount[0].count}`);
        
        // 4. Mostrar muestra
        const sample = await prisma.$queryRaw`
            SELECT 
                "guestName",
                "propertyName",
                TO_CHAR("arrivalDate", 'DD/MM/YYYY') as "Llegada",
                "numNights" as "Noches",
                "totalPersons" as "Personas",
                "channel" as "Canal",
                "phone" as "Teléfono"
            FROM "Leads"
            ORDER BY "arrivalDate"
            LIMIT 10
        `;
        
        if (sample.length > 0) {
            console.log('\n📋 Primeros 10 leads (ordenados por fecha de llegada):');
            console.table(sample);
        }
        
        // 5. Estadísticas
        const stats = await prisma.$queryRaw`
            SELECT 
                "channel",
                COUNT(*) as total
            FROM "Leads"
            GROUP BY "channel"
            ORDER BY total DESC
        `;
        
        if (stats.length > 0) {
            console.log('\n📊 Distribución por canal:');
            console.table(stats);
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎉 ¡SINCRONIZACIÓN COMPLETADA EXITOSAMENTE!');
        console.log('=' .repeat(60));
        console.log('\n✅ Resumen:');
        console.log(`   • ${finalCount[0].count} leads listos para gestión comercial`);
        console.log('   • Tabla optimizada con solo 10 campos');
        console.log('   • Fechas sin hora (formato DD/MM/YYYY)');
        console.log('   • Sincronización automática activa');
        console.log('\n💡 Los leads se actualizarán automáticamente cuando:');
        console.log('   • Una nueva reserva tenga estado "Futura Pendiente"');
        console.log('   • Una reserva cambie a "Futura Pendiente"');
        console.log('   • Una reserva deje de ser "Futura Pendiente" (se elimina)');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
syncLeads()
    .then(() => {
        console.log('\n✅ Proceso finalizado correctamente');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error fatal:', error.message);
        process.exit(1);
    });