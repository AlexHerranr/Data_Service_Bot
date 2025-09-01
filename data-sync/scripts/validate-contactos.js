/**
 * Script de validación para verificar integridad de datos en Contactos
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function validateContactos() {
    console.log('🔍 VALIDACIÓN DE INTEGRIDAD - TABLA CONTACTOS');
    console.log('=' .repeat(60));
    
    try {
        // 1. Comparar totales con fuentes originales
        console.log('\n📊 [1/5] Comparando totales con fuentes originales...\n');
        
        const validation = await prisma.$queryRaw`
            SELECT 
                'Booking (únicos)' as fuente,
                COUNT(DISTINCT normalize_phone("phone")) as cantidad
            FROM "Booking"
            WHERE normalize_phone("phone") IS NOT NULL
            UNION ALL
            SELECT 
                'ClientView (únicos)' as fuente,
                COUNT(DISTINCT normalize_phone("phoneNumber")) as cantidad
            FROM "ClientView"
            WHERE normalize_phone("phoneNumber") IS NOT NULL
            UNION ALL
            SELECT 
                'Contactos (total)' as fuente,
                COUNT(*) as cantidad
            FROM "Contactos"
            UNION ALL
            SELECT 
                'Contactos con WhatsApp' as fuente,
                COUNT(*) as cantidad
            FROM "Contactos"
            WHERE "hasWhatsapp" = true
            UNION ALL
            SELECT 
                'Contactos con Reservas' as fuente,
                COUNT(*) as cantidad
            FROM "Contactos"
            WHERE "totalBookings" > 0
        `;
        
        console.table(validation);
        
        // 2. Verificar consistencia de contadores
        console.log('\n📊 [2/5] Verificando consistencia de contadores...\n');
        
        const counters = await prisma.$queryRaw`
            WITH booking_counts AS (
                SELECT 
                    normalize_phone("phone") as phone,
                    COUNT(*) as real_total,
                    COUNT(CASE WHEN "BDStatus" IN ('Confirmada', 'Futura Confirmada') THEN 1 END) as real_confirmed,
                    COUNT(CASE WHEN "BDStatus" = 'Futura Pendiente' THEN 1 END) as real_pending
                FROM "Booking"
                WHERE normalize_phone("phone") IS NOT NULL
                GROUP BY normalize_phone("phone")
            )
            SELECT 
                COUNT(*) as contactos_verificados,
                COUNT(CASE WHEN c."totalBookings" != bc.real_total THEN 1 END) as discrepancia_total,
                COUNT(CASE WHEN c."confirmedBookings" != bc.real_confirmed THEN 1 END) as discrepancia_confirmed,
                COUNT(CASE WHEN c."pendingBookings" != bc.real_pending THEN 1 END) as discrepancia_pending
            FROM "Contactos" c
            JOIN booking_counts bc ON c."phoneNumber" = bc.phone
        `;
        
        console.table(counters);
        
        const discrepancies = counters[0];
        if (discrepancies.discrepancia_total > 0 || 
            discrepancies.discrepancia_confirmed > 0 || 
            discrepancies.discrepancia_pending > 0) {
            console.log('⚠️ Se encontraron discrepancias en los contadores');
        } else {
            console.log('✅ Todos los contadores están correctos');
        }
        
        // 3. Verificar normalización de teléfonos
        console.log('\n📊 [3/5] Verificando normalización de teléfonos...\n');
        
        const phoneFormats = await prisma.$queryRaw`
            SELECT 
                CASE 
                    WHEN "phoneNumber" LIKE '+57%' THEN 'Colombia (+57)'
                    WHEN "phoneNumber" LIKE '+1%' THEN 'USA/Canada (+1)'
                    WHEN "phoneNumber" LIKE '+%' THEN 'Otro internacional'
                    ELSE 'Sin formato estándar'
                END as formato,
                COUNT(*) as cantidad,
                MIN(LENGTH("phoneNumber")) as min_longitud,
                MAX(LENGTH("phoneNumber")) as max_longitud
            FROM "Contactos"
            GROUP BY formato
            ORDER BY cantidad DESC
        `;
        
        console.table(phoneFormats);
        
        // 4. Detectar posibles duplicados
        console.log('\n📊 [4/5] Buscando posibles duplicados...\n');
        
        const duplicates = await prisma.$queryRaw`
            SELECT 
                c1."phoneNumber" as telefono1,
                c2."phoneNumber" as telefono2,
                c1."name" as nombre
            FROM "Contactos" c1
            JOIN "Contactos" c2 ON 
                c1."id" < c2."id" AND
                REPLACE(REPLACE(c1."phoneNumber", '+', ''), '57', '') = 
                REPLACE(REPLACE(c2."phoneNumber", '+', ''), '57', '')
            LIMIT 5
        `;
        
        if (duplicates.length > 0) {
            console.log('⚠️ Posibles duplicados encontrados:');
            console.table(duplicates);
        } else {
            console.log('✅ No se encontraron duplicados');
        }
        
        // 5. Estadísticas de calidad de datos
        console.log('\n📊 [5/5] Estadísticas de calidad de datos...\n');
        
        const quality = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total_contactos,
                COUNT("name") as con_nombre,
                ROUND(COUNT("name")::numeric * 100.0 / COUNT(*), 1) as porcentaje_con_nombre,
                COUNT("email") as con_email,
                ROUND(COUNT("email")::numeric * 100.0 / COUNT(*), 1) as porcentaje_con_email,
                COUNT(CASE WHEN "hasWhatsapp" = true THEN 1 END) as con_whatsapp,
                COUNT(CASE WHEN "totalBookings" > 0 THEN 1 END) as con_reservas,
                COUNT(CASE WHEN "syncErrors" > 0 THEN 1 END) as con_errores_sync
            FROM "Contactos"
        `;
        
        console.table(quality);
        
        // Resumen final
        console.log('\n' + '=' .repeat(60));
        console.log('📋 RESUMEN DE VALIDACIÓN:\n');
        
        const summary = quality[0];
        if (summary.con_errores_sync > 0) {
            console.log(`⚠️ Hay ${summary.con_errores_sync} contactos con errores de sincronización`);
            
            const errors = await prisma.$queryRaw`
                SELECT "phoneNumber", "name", "syncErrors"
                FROM "Contactos"
                WHERE "syncErrors" > 0
                LIMIT 5
            `;
            
            console.log('\nContactos con errores:');
            console.table(errors);
        }
        
        console.log('\n✅ Validación completada');
        console.log(`  • ${summary.total_contactos} contactos totales`);
        console.log(`  • ${summary.porcentaje_con_nombre}% tienen nombre`);
        console.log(`  • ${summary.porcentaje_con_email}% tienen email`);
        console.log(`  • ${summary.con_whatsapp} con WhatsApp activo`);
        console.log(`  • ${summary.con_reservas} con al menos una reserva`);
        
    } catch (error) {
        console.error('❌ Error en validación:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
validateContactos();