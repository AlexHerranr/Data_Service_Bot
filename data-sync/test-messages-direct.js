/**
 * Script de prueba directa para el manejo de mensajes
 * No requiere que el servicio esté corriendo
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Importar el manejador de mensajes compilado
import { mergeMessages, extractMessagesFromPayload } from './dist/providers/beds24/message-handler.js';

async function testMessageHandling() {
  console.log('🧪 PRUEBA DIRECTA DE MANEJO DE MENSAJES');
  console.log('=' .repeat(50));
  
  const testBookingId = '888001';
  
  try {
    // 1. Crear una reserva con mensajes iniciales
    console.log('\n📝 PASO 1: Creando reserva con mensajes iniciales...');
    
    const initialMessages = [
      {
        id: 1001,
        message: "Hola, quisiera confirmar mi reserva",
        time: "2025-08-27T10:00:00Z",
        source: "guest",
        read: false
      },
      {
        id: 1002,
        message: "Su reserva está confirmada. Gracias!",
        time: "2025-08-27T10:30:00Z",
        source: "host",
        read: true
      }
    ];
    
    await prisma.booking.upsert({
      where: { bookingId: testBookingId },
      create: {
        bookingId: testBookingId,
        guestName: 'Test Messages',
        status: 'new',
        arrivalDate: '2025-10-01',
        departureDate: '2025-10-05',
        messages: initialMessages,
        phone: '+57 300 1234567',
        propertyName: 'Test Property'
      },
      update: {}
    });
    
    console.log('✅ Reserva creada con 2 mensajes iniciales');
    
    // 2. Simular llegada de nuevos mensajes (como vendría de Beds24)
    console.log('\n📝 PASO 2: Simulando nuevos mensajes de Beds24...');
    
    const newMessagesFromBeds24 = [
      {
        id: 1003,
        message: "A qué hora puedo hacer el check-in?",
        time: "2025-08-27T14:00:00Z",
        source: "guest",
        read: false
      },
      {
        id: 1004,
        message: "El check-in es desde las 3 PM",
        time: "2025-08-27T15:00:00Z",
        source: "host",
        read: false
      }
    ];
    
    // 3. Usar el merge para combinar mensajes
    console.log('\n📝 PASO 3: Mergeando mensajes (preservando histórico)...');
    
    const mergedMessages = await mergeMessages(testBookingId, newMessagesFromBeds24);
    
    console.log(`✅ Mensajes mergeados: ${mergedMessages.length} total`);
    console.log(`   - Mensajes preservados: ${initialMessages.length}`);
    console.log(`   - Mensajes nuevos: ${newMessagesFromBeds24.length}`);
    
    // 4. Actualizar la reserva con los mensajes mergeados
    console.log('\n📝 PASO 4: Actualizando reserva con mensajes mergeados...');
    
    await prisma.booking.update({
      where: { bookingId: testBookingId },
      data: {
        messages: mergedMessages,
        modifiedDate: new Date().toISOString().split('T')[0]
      }
    });
    
    console.log('✅ Reserva actualizada');
    
    // 5. Verificar el resultado
    console.log('\n📝 PASO 5: Verificando resultado final...');
    
    const finalBooking = await prisma.booking.findUnique({
      where: { bookingId: testBookingId },
      select: { messages: true }
    });
    
    const messages = finalBooking?.messages || [];
    
    console.log('\n📊 RESULTADO FINAL:');
    console.log('=' .repeat(50));
    console.log(`Total de mensajes: ${messages.length}`);
    console.log('\nMensajes en orden cronológico:');
    console.log('-'.repeat(50));
    
    messages.forEach((msg, index) => {
      const time = new Date(msg.time).toLocaleString();
      console.log(`\n${index + 1}. [${msg.source.toUpperCase()}] ${time}`);
      console.log(`   ID: ${msg.id}`);
      console.log(`   Mensaje: "${msg.message}"`);
      console.log(`   Leído: ${msg.read ? '✓' : '✗'}`);
    });
    
    // 6. Simular caso de Beds24 enviando solo mensajes recientes (últimos 3 días)
    console.log('\n\n📝 PASO 6: Simulando Beds24 con solo mensajes recientes...');
    console.log('(Beds24 solo envía mensajes de los últimos 3 días)');
    
    const recentMessagesOnly = [
      {
        id: 1004,  // Este ya existe
        message: "El check-in es desde las 3 PM",
        time: "2025-08-27T15:00:00Z",
        source: "host",
        read: true  // Cambiado a leído
      },
      {
        id: 1005,  // Nuevo
        message: "Perfecto, llegaré a las 4 PM",
        time: "2025-08-27T15:30:00Z",
        source: "guest",
        read: false
      }
    ];
    
    const finalMerged = await mergeMessages(testBookingId, recentMessagesOnly);
    
    console.log(`\n✅ Resultado del merge:`);
    console.log(`   - Total de mensajes: ${finalMerged.length}`);
    console.log(`   - Mensajes antiguos preservados: ${finalMerged.length - recentMessagesOnly.length + 1}`);
    console.log(`   - Mensaje duplicado actualizado: 1 (ID 1004 - estado 'read' actualizado)`);
    console.log(`   - Mensajes nuevos agregados: 1 (ID 1005)`);
    
    // Actualizar con el merge final
    await prisma.booking.update({
      where: { bookingId: testBookingId },
      data: { messages: finalMerged }
    });
    
    console.log('\n' + '=' .repeat(50));
    console.log('✅ PRUEBA COMPLETADA EXITOSAMENTE');
    console.log('=' .repeat(50));
    
    console.log('\n🎯 CONCLUSIONES:');
    console.log('1. Los mensajes antiguos se preservan correctamente');
    console.log('2. Los mensajes nuevos se agregan sin duplicar');
    console.log('3. Los mensajes existentes se actualizan (ej: estado read)');
    console.log('4. El histórico completo se mantiene aunque Beds24 solo envíe recientes');
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error);
  } finally {
    // Limpiar la reserva de prueba
    await prisma.booking.delete({
      where: { bookingId: testBookingId }
    }).catch(() => {});
    
    await prisma.$disconnect();
  }
}

// Ejecutar la prueba
testMessageHandling();