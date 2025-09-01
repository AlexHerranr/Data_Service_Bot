/**
 * Script para sincronizar los 378 teléfonos faltantes en IA_CRM_Clientes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncMissingPhones() {
    console.log('🔄 SINCRONIZANDO TELÉFONOS FALTANTES EN IA_CRM_Clientes');
    console.log('=' .repeat(80));
    
    try {
        // 1. Identificar todos los teléfonos faltantes
        console.log('\n📱 Identificando teléfonos faltantes...');
        
        const missingPhones = await prisma.$queryRaw`
            WITH booking_phones AS (
                SELECT DISTINCT 
                    "phone",
                    MIN("guestName") as guest_name,
                    MIN("email") as email,
                    MAX("bookingId") as last_booking_id,
                    MAX("BDStatus") as last_status,
                    MAX("channel") as last_channel,
                    MAX("propertyName") as property_name,
                    MAX("arrivalDate") as last_arrival,
                    MAX("departureDate") as last_departure,
                    COUNT(*) as total_bookings,
                    SUM(
                        CASE 
                            WHEN "totalCharges" ~ '^[0-9]+\.?[0-9]*$' 
                            THEN CAST("totalCharges" AS DECIMAL)::INTEGER
                            ELSE 0
                        END
                    ) as total_value
                FROM "Booking"
                WHERE "phone" IS NOT NULL 
                    AND "phone" != '' 
                    AND "phone" != 'unknown'
                GROUP BY "phone"
            )
            SELECT 
                b.*
            FROM booking_phones b
            LEFT JOIN "IA_CRM_Clientes" c ON b."phone" = c."phoneNumber"
            WHERE c."phoneNumber" IS NULL
        `;
        
        console.log(`✅ Encontrados ${missingPhones.length} teléfonos faltantes`);
        
        if (missingPhones.length === 0) {
            console.log('📌 No hay teléfonos faltantes. Todo sincronizado.');
            return;
        }
        
        // 2. Insertar los teléfonos faltantes
        console.log('\n📝 Insertando registros faltantes...');
        
        let inserted = 0;
        let errors = 0;
        
        for (const phone of missingPhones) {
            try {
                await prisma.$executeRawUnsafe(`
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
                    VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW()
                    )
                    ON CONFLICT ("phoneNumber") DO NOTHING
                `,
                    phone.phone,
                    phone.guest_name || 'Cliente',
                    phone.email,
                    phone.last_booking_id,
                    phone.last_status || 'Sin estado',
                    phone.last_channel || 'direct',
                    phone.property_name || 'Sin asignar',
                    phone.last_arrival,
                    phone.last_departure,
                    Number(phone.total_bookings) || 0,
                    Number(phone.total_value) || 0
                );
                inserted++;
                
                // Mostrar progreso cada 50 registros
                if (inserted % 50 === 0) {
                    console.log(`   ✅ ${inserted} registros insertados...`);
                }
            } catch (e) {
                errors++;
                console.log(`   ⚠️ Error con teléfono ${phone.phone}: ${e.message}`);
            }
        }
        
        console.log(`\n✅ Sincronización completada:`);
        console.log(`   • Insertados: ${inserted} registros`);
        console.log(`   • Errores: ${errors}`);
        
        // 3. Verificar el resultado
        console.log('\n📊 VERIFICACIÓN FINAL:');
        
        const finalStats = await prisma.$queryRaw`
            SELECT 
                (SELECT COUNT(DISTINCT "phone") FROM "Booking" 
                 WHERE "phone" IS NOT NULL AND "phone" != '' AND "phone" != 'unknown') as telefonos_booking,
                (SELECT COUNT(*) FROM "IA_CRM_Clientes") as registros_crm,
                (SELECT COUNT(DISTINCT "phoneNumber") FROM "IA_CRM_Clientes") as telefonos_crm
        `;
        
        console.table(finalStats);
        
        // 4. Ver distribución por estado
        const statusDistribution = await prisma.$queryRaw`
            SELECT 
                "currentStatus",
                COUNT(*) as total
            FROM "IA_CRM_Clientes"
            GROUP BY "currentStatus"
            ORDER BY COUNT(*) DESC
            LIMIT 10
        `;
        
        console.log('\n📈 Distribución por estado en CRM:');
        console.table(statusDistribution);
        
        // 5. Verificar si quedan faltantes
        const stillMissing = await prisma.$queryRaw`
            WITH booking_phones AS (
                SELECT DISTINCT "phone"
                FROM "Booking"
                WHERE "phone" IS NOT NULL 
                    AND "phone" != '' 
                    AND "phone" != 'unknown'
            )
            SELECT COUNT(*) as faltantes
            FROM booking_phones b
            LEFT JOIN "IA_CRM_Clientes" c ON b."phone" = c."phoneNumber"
            WHERE c."phoneNumber" IS NULL
        `;
        
        if (stillMissing[0].faltantes > 0) {
            console.log(`\n⚠️ Aún quedan ${stillMissing[0].faltantes} teléfonos sin sincronizar`);
        } else {
            console.log('\n🎉 ¡TODOS LOS TELÉFONOS SINCRONIZADOS!');
        }
        
        console.log('\n' + '=' .repeat(80));
        console.log('✅ SINCRONIZACIÓN MASIVA COMPLETADA');
        console.log('=' .repeat(80));
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
syncMissingPhones()
    .then(() => {
        console.log('\n✅ Script completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });