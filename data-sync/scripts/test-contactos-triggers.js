/**
 * Script para probar que los triggers de Contactos funcionan correctamente
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testTriggers() {
    console.log('🧪 PRUEBA DE TRIGGERS - TABLA CONTACTOS');
    console.log('=' .repeat(60));
    
    const testPhone = '+573001234TEST';
    const testName = 'TEST Cliente Prueba';
    const testEmail = 'test@prueba.com';
    
    try {
        // 1. Limpiar datos de prueba anteriores
        console.log('\n🗑️ Limpiando datos de prueba anteriores...');
        
        await prisma.$executeRaw`
            DELETE FROM "Contactos" WHERE "phoneNumber" = ${testPhone}
        `;
        
        await prisma.$executeRaw`
            DELETE FROM "Booking" WHERE "phone" = '3001234TEST'
        `;
        
        await prisma.$executeRaw`
            DELETE FROM "ClientView" WHERE "phoneNumber" = '3001234TEST'
        `;
        
        console.log('✅ Limpieza completada');
        
        // 2. Crear una reserva de prueba
        console.log('\n📝 [TEST 1] Creando reserva de prueba en Booking...');
        
        await prisma.$executeRaw`
            INSERT INTO "Booking" (
                "id", "bookingId", "guestName", "phone", "email",
                "propertyName", "arrivalDate", "departureDate",
                "totalCharges", "BDStatus", "channel", "status",
                "lastUpdatedBD"
            ) VALUES (
                gen_random_uuid(),
                'TEST-001',
                ${testName},
                '3001234TEST',
                ${testEmail},
                'Apto Test 101',
                CURRENT_DATE + INTERVAL '30 days',
                CURRENT_DATE + INTERVAL '33 days',
                '1500000',
                'Futura Pendiente',
                'Direct',
                'new',
                NOW()
            )
        `;
        
        console.log('✅ Reserva creada');
        
        // Verificar que se creó en Contactos
        await new Promise(r => setTimeout(r, 1000)); // Esperar 1 segundo
        
        const contactAfterBooking = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "email",
                "totalBookings",
                "pendingBookings",
                "totalSpent",
                "hasWhatsapp",
                array_to_string("source", ', ') as sources
            FROM "Contactos"
            WHERE "phoneNumber" = ${testPhone}
        `;
        
        console.log('\n📊 Estado en Contactos después de crear reserva:');
        console.table(contactAfterBooking);
        
        if (contactAfterBooking.length > 0) {
            console.log('✅ Trigger de Booking funcionó correctamente');
        } else {
            console.log('❌ El trigger de Booking NO funcionó');
        }
        
        // 3. Agregar a ClientView (WhatsApp)
        console.log('\n📝 [TEST 2] Agregando a ClientView (WhatsApp)...');
        
        await prisma.$executeRaw`
            INSERT INTO "ClientView" (
                "phoneNumber",
                "name",
                "chatId",
                "labels",
                "lastActivity"
            ) VALUES (
                '3001234TEST',
                'TEST WhatsApp Name',
                '573001234TEST@s.whatsapp.net',
                'Test Label',
                NOW()
            )
        `;
        
        console.log('✅ Agregado a ClientView');
        
        // Verificar actualización en Contactos
        await new Promise(r => setTimeout(r, 1000));
        
        const contactAfterWhatsApp = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "hasWhatsapp",
                "whatsappLabels",
                "totalBookings",
                array_to_string("source", ', ') as sources
            FROM "Contactos"
            WHERE "phoneNumber" = ${testPhone}
        `;
        
        console.log('\n📊 Estado después de agregar WhatsApp:');
        console.table(contactAfterWhatsApp);
        
        if (contactAfterWhatsApp[0]?.haswhatsapp) {
            console.log('✅ Trigger de ClientView funcionó correctamente');
        } else {
            console.log('❌ El trigger de ClientView NO funcionó');
        }
        
        // 4. Actualizar la reserva (cambiar status)
        console.log('\n📝 [TEST 3] Actualizando reserva (confirmando)...');
        
        await prisma.$executeRaw`
            UPDATE "Booking"
            SET "BDStatus" = 'Confirmada',
                "lastUpdatedBD" = NOW()
            WHERE "phone" = '3001234TEST'
        `;
        
        console.log('✅ Reserva actualizada a Confirmada');
        
        await new Promise(r => setTimeout(r, 1000));
        
        const contactAfterUpdate = await prisma.$queryRaw`
            SELECT 
                "totalBookings",
                "confirmedBookings",
                "pendingBookings",
                "totalSpent"
            FROM "Contactos"
            WHERE "phoneNumber" = ${testPhone}
        `;
        
        console.log('\n📊 Contadores después de confirmar reserva:');
        console.table(contactAfterUpdate);
        
        // 5. Crear segunda reserva del mismo cliente
        console.log('\n📝 [TEST 4] Creando segunda reserva del mismo cliente...');
        
        await prisma.$executeRaw`
            INSERT INTO "Booking" (
                "id", "bookingId", "guestName", "phone", "email",
                "propertyName", "arrivalDate", "departureDate",
                "totalCharges", "BDStatus", "channel", "status",
                "lastUpdatedBD"
            ) VALUES (
                gen_random_uuid(),
                'TEST-002',
                ${testName},
                '3001234TEST',
                ${testEmail},
                'Apto Test 202',
                CURRENT_DATE + INTERVAL '60 days',
                CURRENT_DATE + INTERVAL '63 days',
                '2000000',
                'Futura Confirmada',
                'Direct',
                'new',
                NOW()
            )
        `;
        
        console.log('✅ Segunda reserva creada');
        
        await new Promise(r => setTimeout(r, 1000));
        
        const contactFinal = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "totalBookings",
                "confirmedBookings",
                "pendingBookings",
                "totalSpent",
                "hasWhatsapp",
                array_to_string("source", ', ') as sources
            FROM "Contactos"
            WHERE "phoneNumber" = ${testPhone}
        `;
        
        console.log('\n📊 Estado final después de todas las pruebas:');
        console.table(contactFinal);
        
        // Resumen de pruebas
        console.log('\n' + '=' .repeat(60));
        console.log('📋 RESUMEN DE PRUEBAS:\n');
        
        const final = contactFinal[0];
        if (final) {
            const tests = [
                {
                    prueba: 'Trigger INSERT Booking',
                    esperado: 'totalBookings >= 2',
                    resultado: final.totalbookings >= 2 ? '✅ PASÓ' : '❌ FALLÓ'
                },
                {
                    prueba: 'Trigger UPDATE Booking',
                    esperado: 'confirmedBookings >= 2',
                    resultado: final.confirmedbookings >= 2 ? '✅ PASÓ' : '❌ FALLÓ'
                },
                {
                    prueba: 'Trigger ClientView',
                    esperado: 'hasWhatsapp = true',
                    resultado: final.haswhatsapp ? '✅ PASÓ' : '❌ FALLÓ'
                },
                {
                    prueba: 'Acumulación de montos',
                    esperado: 'totalSpent = 3500000',
                    resultado: final.totalspent == 3500000 ? '✅ PASÓ' : '❌ FALLÓ'
                },
                {
                    prueba: 'Merge de fuentes',
                    esperado: 'sources = booking, whatsapp',
                    resultado: final.sources.includes('booking') && final.sources.includes('whatsapp') 
                        ? '✅ PASÓ' : '❌ FALLÓ'
                }
            ];
            
            console.table(tests);
        }
        
        // 6. Limpiar datos de prueba
        console.log('\n🗑️ Limpiando datos de prueba...');
        
        await prisma.$executeRaw`
            DELETE FROM "Booking" WHERE "phone" = '3001234TEST'
        `;
        
        await prisma.$executeRaw`
            DELETE FROM "ClientView" WHERE "phoneNumber" = '3001234TEST'
        `;
        
        await prisma.$executeRaw`
            DELETE FROM "Contactos" WHERE "phoneNumber" = ${testPhone}
        `;
        
        console.log('✅ Datos de prueba eliminados');
        
    } catch (error) {
        console.error('❌ Error en pruebas:', error.message);
        
        // Intentar limpiar en caso de error
        try {
            await prisma.$executeRaw`DELETE FROM "Booking" WHERE "phone" = '3001234TEST'`;
            await prisma.$executeRaw`DELETE FROM "ClientView" WHERE "phoneNumber" = '3001234TEST'`;
            await prisma.$executeRaw`DELETE FROM "Contactos" WHERE "phoneNumber" = ${testPhone}`;
        } catch (e) {
            // Ignorar errores de limpieza
        }
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
testTriggers();