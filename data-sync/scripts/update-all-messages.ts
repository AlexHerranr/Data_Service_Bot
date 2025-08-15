#!/usr/bin/env tsx
/**
 * ACTUALIZAR TODOS LOS MENSAJES POR BOOKING ID
 * 
 * Descarga mensajes específicos para cada booking desde Beds24
 * y actualiza la columna messages en la BD
 */
import { getBeds24Client } from '../src/providers/beds24/client.js';
import { connectPrisma, prisma } from '../src/infra/db/prisma.client.js';
import { logger } from '../src/utils/logger.js';

async function updateAllMessages() {
  console.log('💬 UPDATING ALL MESSAGES - Downloading from Beds24 by bookingId');
  
  await connectPrisma();
  const client = getBeds24Client();
  console.log('✅ Connected to database and Beds24 client');

  // 1. Obtener todos los bookingIds únicos
  const allBookings = await prisma.booking.findMany({
    select: { bookingId: true, messages: true },
    orderBy: { id: 'asc' }
  });

  console.log(`📋 Found ${allBookings.length} bookings to process`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const booking of allBookings) {
    try {
      console.log(`💬 Processing messages for booking ${booking.bookingId}...`);

      // 2. Descargar mensajes específicos por bookingId
      const messagesResponse = await client.requestWithRetry({
        method: 'GET',
        url: `/bookings/messages?bookingId=${booking.bookingId}&maxAge=365`, // Últimos 365 días
      });

      // La respuesta de Beds24 tiene estructura: { data: [...] }
      const messagesData = messagesResponse.data?.data || [];
      
      // Verificar que messagesData es un array
      if (!Array.isArray(messagesData) || messagesData.length === 0) {
        console.log(`   ⭕ No messages found for booking ${booking.bookingId}`);
        skipped++;
        continue;
      }

      // 3. Formato estándar para mensajes
      const formattedMessages = messagesData.map((msg: any) => ({
        id: msg.id,
        message: msg.message || msg.text,
        time: msg.time || msg.timestamp,
        source: msg.source || 'beds24',
        read: msg.read || false,
        type: msg.type || 'text',
        direction: msg.direction || 'unknown' // incoming/outgoing
      }));

      // 4. UPSERT: actualizar mensajes en la BD
      await prisma.booking.update({
        where: { bookingId: booking.bookingId },
        data: {
          messages: formattedMessages,
          lastUpdatedBD: new Date()
        }
      });

      console.log(`   ✅ Updated ${formattedMessages.length} messages for booking ${booking.bookingId}`);
      updated++;

      // Rate limiting para evitar sobrecargar API
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error: any) {
      console.log(`   ❌ Error processing booking ${booking.bookingId}: ${error.message}`);
      errors++;
      
      // Continuar con el siguiente booking
      continue;
    }
  }

  console.log('\n📊 MESSAGES UPDATE COMPLETED:');
  console.log(`✅ Updated: ${updated} bookings`);
  console.log(`⭕ Skipped (no messages): ${skipped} bookings`);
  console.log(`❌ Errors: ${errors} bookings`);
  console.log(`📋 Total processed: ${allBookings.length} bookings`);

  await prisma.$disconnect();
}

// Función para actualizar mensajes de bookings específicos
async function updateMessagesForBookings(bookingIds: string[]) {
  console.log(`💬 UPDATING MESSAGES - Specific bookings: ${bookingIds.join(', ')}`);
  
  await connectPrisma();
  const client = getBeds24Client();

  for (const bookingId of bookingIds) {
    try {
      console.log(`💬 Downloading messages for booking ${bookingId}...`);

      const messagesResponse = await client.requestWithRetry({
        method: 'GET',
        url: `/bookings/messages?bookingId=${bookingId}&maxAge=365`,
      });

      const messagesData = messagesResponse.data?.data || [];
      
      if (!Array.isArray(messagesData) || messagesData.length === 0) {
        console.log(`⭕ No messages found for booking ${bookingId}`);
        continue;
      }
      
      const formattedMessages = messagesData.map((msg: any) => ({
        id: msg.id,
        message: msg.message || msg.text,
        time: msg.time || msg.timestamp,
        source: msg.source || 'beds24',
        read: msg.read || false,
        type: msg.type || 'text',
        direction: msg.direction || 'unknown'
      }));

      await prisma.booking.update({
        where: { bookingId },
        data: {
          messages: formattedMessages,
          lastUpdatedBD: new Date()
        }
      });

      console.log(`✅ Updated ${formattedMessages.length} messages for booking ${bookingId}`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error: any) {
      console.log(`❌ Error updating messages for booking ${bookingId}: ${error.message}`);
    }
  }

  await prisma.$disconnect();
}

// Ejecutar según argumentos
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    // Bookings específicos
    const bookingIds = args[0].split(',').map(id => id.trim());
    await updateMessagesForBookings(bookingIds);
  } else {
    // Todos los bookings
    await updateAllMessages();
  }
}

main().catch(console.error);