/**
 * Script para ver los Leads con fechas formateadas de manera legible
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function viewLeadsFormatted() {
    console.log('📊 TABLA DE LEADS - VISTA FORMATEADA');
    console.log('=' .repeat(80));
    
    try {
        // 1. Contar total
        const totalCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Leads"`;
        console.log(`\n📈 Total de Leads: ${totalCount[0].count}`);
        
        // 2. Mostrar todos los leads con fechas formateadas
        const leads = await prisma.$queryRaw`
            SELECT 
                "bookingId" as "ID Reserva",
                "guestName" as "Huésped",
                "phone" as "Teléfono",
                "propertyName" as "Propiedad",
                TO_CHAR("arrivalDate", 'DD/MM/YYYY') as "Llegada",
                TO_CHAR("departureDate", 'DD/MM/YYYY') as "Salida",
                "numNights" as "Noches",
                "totalPersons" as "Personas",
                "channel" as "Canal",
                TO_CHAR("createdAt", 'DD/MM/YYYY HH24:MI') as "Creado"
            FROM "Leads"
            ORDER BY "arrivalDate", "guestName"
        `;
        
        if (leads.length > 0) {
            console.log('\n📋 TODOS LOS LEADS (ordenados por fecha de llegada):\n');
            console.table(leads);
        }
        
        // 3. Estadísticas por mes
        const byMonth = await prisma.$queryRaw`
            SELECT 
                TO_CHAR("arrivalDate", 'MM/YYYY') as "Mes",
                COUNT(*) as "Total Leads",
                SUM("totalPersons") as "Total Personas"
            FROM "Leads"
            GROUP BY TO_CHAR("arrivalDate", 'MM/YYYY'), 
                     EXTRACT(YEAR FROM "arrivalDate"),
                     EXTRACT(MONTH FROM "arrivalDate")
            ORDER BY EXTRACT(YEAR FROM "arrivalDate"), 
                     EXTRACT(MONTH FROM "arrivalDate")
        `;
        
        if (byMonth.length > 0) {
            console.log('\n📅 DISTRIBUCIÓN POR MES:');
            console.table(byMonth);
        }
        
        // 4. Próximas llegadas (próximos 30 días)
        const upcoming = await prisma.$queryRaw`
            SELECT 
                "guestName" as "Huésped",
                "propertyName" as "Propiedad",
                TO_CHAR("arrivalDate", 'DD/MM/YYYY') as "Llegada",
                "numNights" as "Noches",
                "totalPersons" as "Pers",
                "phone" as "Teléfono",
                "channel" as "Canal"
            FROM "Leads"
            WHERE "arrivalDate" >= CURRENT_DATE
              AND "arrivalDate" <= CURRENT_DATE + INTERVAL '30 days'
            ORDER BY "arrivalDate"
            LIMIT 10
        `;
        
        if (upcoming.length > 0) {
            console.log('\n🔜 PRÓXIMAS LLEGADAS (próximos 30 días):');
            console.table(upcoming);
        }
        
        // 5. Leads sin teléfono válido
        const noPhone = await prisma.$queryRaw`
            SELECT 
                "guestName" as "Huésped",
                TO_CHAR("arrivalDate", 'DD/MM/YYYY') as "Llegada",
                "phone" as "Teléfono Actual",
                "channel" as "Canal"
            FROM "Leads"
            WHERE "phone" IN ('unknown', 'Sin teléfono', '') 
               OR "phone" IS NULL
               OR LENGTH("phone") < 5
            ORDER BY "arrivalDate"
        `;
        
        if (noPhone.length > 0) {
            console.log(`\n⚠️  LEADS SIN TELÉFONO VÁLIDO (${noPhone.length} de ${totalCount[0].count}):`);
            console.table(noPhone);
        }
        
        // 6. Resumen por canal
        console.log('\n📊 RESUMEN POR CANAL:');
        const channels = await prisma.$queryRaw`
            SELECT 
                "channel" as "Canal",
                COUNT(*) as "Leads",
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "Leads"), 1) || '%' as "Porcentaje"
            FROM "Leads"
            GROUP BY "channel"
            ORDER BY COUNT(*) DESC
        `;
        console.table(channels);
        
        console.log('\n' + '=' .repeat(80));
        console.log('💡 NOTAS:');
        console.log('• Fechas mostradas en formato DD/MM/YYYY');
        console.log('• Hora de creación en formato 24 horas (HH:MI)');
        console.log('• Leads ordenados por fecha de llegada');
        console.log('• Solo se muestran reservas con estado "Futura Pendiente"');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
viewLeadsFormatted()
    .then(() => {
        console.log('\n✅ Consulta completada');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });