/**
 * Script para sincronizar TODOS los teléfonos faltantes usando INSERT masivo
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncAllMissingBulk() {
    console.log('🔄 SINCRONIZACIÓN MASIVA DE TELÉFONOS FALTANTES');
    console.log('=' .repeat(80));
    
    try {
        // 1. Contar cuántos faltan
        console.log('\n📊 Estado inicial:');
        const initialCount = await prisma.$queryRaw`
            SELECT 
                (SELECT COUNT(DISTINCT "phone") FROM "Booking" 
                 WHERE "phone" IS NOT NULL AND "phone" != '' AND "phone" != 'unknown') as total_booking,
                (SELECT COUNT(*) FROM "IA_CRM_Clientes") as total_crm
        `;
        console.table(initialCount);
        
        // 2. Sincronizar TODOS los faltantes de una vez
        console.log('\n🚀 Ejecutando sincronización masiva...');
        
        const result = await prisma.$executeRawUnsafe(`
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
                "totalBookings",
                "totalValue",
                "lastInteraction",
                "createdAt",
                "updatedAt"
            )
            SELECT 
                b."phone" as "phoneNumber",
                MIN(b."guestName") as "clientName",
                MIN(b."email") as "email",
                MAX(b."bookingId") as "bookingId",
                COALESCE(MAX(b."BDStatus"), 'Sin estado') as "currentStatus",
                COALESCE(MAX(b."channel"), 'direct') as "source",
                COALESCE(MAX(b."propertyName"), 'Sin asignar') as "propertyName",
                MAX(b."arrivalDate")::date as "arrivalDate",
                MAX(b."departureDate")::date as "departureDate",
                COUNT(*) as "totalBookings",
                COALESCE(SUM(
                    CASE 
                        WHEN b."totalCharges" ~ '^[0-9]+\\.?[0-9]*$' 
                        THEN CAST(b."totalCharges" AS DECIMAL)::INTEGER
                        ELSE 0
                    END
                ), 0) as "totalValue",
                NOW() as "lastInteraction",
                NOW() as "createdAt",
                NOW() as "updatedAt"
            FROM "Booking" b
            WHERE b."phone" IS NOT NULL 
                AND b."phone" != '' 
                AND b."phone" != 'unknown'
                AND NOT EXISTS (
                    SELECT 1 FROM "IA_CRM_Clientes" c 
                    WHERE c."phoneNumber" = b."phone"
                )
            GROUP BY b."phone"
            ON CONFLICT ("phoneNumber") DO NOTHING
        `);
        
        console.log(`✅ Operación completada. Registros afectados: ${result}`);
        
        // 3. Verificar resultados
        console.log('\n📊 VERIFICACIÓN FINAL:');
        
        const finalCount = await prisma.$queryRaw`
            SELECT 
                (SELECT COUNT(DISTINCT "phone") FROM "Booking" 
                 WHERE "phone" IS NOT NULL AND "phone" != '' AND "phone" != 'unknown') as total_booking,
                (SELECT COUNT(*) FROM "IA_CRM_Clientes") as total_crm,
                (SELECT COUNT(DISTINCT "phoneNumber") FROM "IA_CRM_Clientes") as unique_crm
        `;
        console.table(finalCount);
        
        // 4. Ver distribución actualizada
        const distribution = await prisma.$queryRaw`
            SELECT 
                "currentStatus",
                COUNT(*) as total,
                ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as porcentaje
            FROM "IA_CRM_Clientes"
            GROUP BY "currentStatus"
            ORDER BY COUNT(*) DESC
            LIMIT 15
        `;
        
        console.log('\n📈 DISTRIBUCIÓN POR ESTADO:');
        console.table(distribution);
        
        // 5. Verificar si aún quedan faltantes
        const stillMissing = await prisma.$queryRaw`
            SELECT COUNT(DISTINCT b."phone") as faltantes
            FROM "Booking" b
            LEFT JOIN "IA_CRM_Clientes" c ON b."phone" = c."phoneNumber"
            WHERE b."phone" IS NOT NULL 
                AND b."phone" != '' 
                AND b."phone" != 'unknown'
                AND c."phoneNumber" IS NULL
        `;
        
        console.log('\n' + '=' .repeat(80));
        if (stillMissing[0].faltantes > 0) {
            console.log(`⚠️ Aún quedan ${stillMissing[0].faltantes} teléfonos sin sincronizar`);
            
            // Mostrar algunos ejemplos
            const examples = await prisma.$queryRaw`
                SELECT 
                    b."phone",
                    MIN(b."guestName") as nombre,
                    COUNT(*) as reservas
                FROM "Booking" b
                LEFT JOIN "IA_CRM_Clientes" c ON b."phone" = c."phoneNumber"
                WHERE b."phone" IS NOT NULL 
                    AND b."phone" != '' 
                    AND b."phone" != 'unknown'
                    AND c."phoneNumber" IS NULL
                GROUP BY b."phone"
                LIMIT 5
            `;
            
            console.log('\nEjemplos de faltantes:');
            console.table(examples);
        } else {
            console.log('🎉 ¡TODOS LOS TELÉFONOS SINCRONIZADOS EXITOSAMENTE!');
        }
        
        // 6. Resumen final
        const summary = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total_registros,
                COUNT(CASE WHEN "currentStatus" LIKE '%Cancelada%' THEN 1 END) as canceladas,
                COUNT(CASE WHEN "currentStatus" = 'Futura Pendiente' THEN 1 END) as pendientes,
                COUNT(CASE WHEN "currentStatus" = 'Futura Confirmada' THEN 1 END) as confirmadas,
                COUNT(CASE WHEN "currentStatus" = 'Pasada Confirmada' THEN 1 END) as completadas,
                COUNT(CASE WHEN "currentStatus" = 'Contacto WSP' THEN 1 END) as whatsapp
            FROM "IA_CRM_Clientes"
        `;
        
        console.log('\n📊 RESUMEN FINAL DEL CRM:');
        console.table(summary);
        
        console.log('\n✅ La tabla IA_CRM_Clientes ahora contiene:');
        console.log(`   • ${finalCount[0].total_crm} registros totales`);
        console.log(`   • ${finalCount[0].unique_crm} teléfonos únicos`);
        console.log(`   • Sincronizado con ${finalCount[0].total_booking} teléfonos de Booking`);
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('Detalle:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
syncAllMissingBulk()
    .then(() => {
        console.log('\n✅ Sincronización masiva completada exitosamente');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error en sincronización:', error.message);
        process.exit(1);
    });