#!/usr/bin/env tsx

/**
 * SAFE UPDATE - Evita problemas con leadType
 * Solo actualiza campos básicos esenciales
 */

import { getBeds24Client } from '../src/providers/beds24/client.js';
import { connectPrisma, prisma } from '../src/infra/db/prisma.client.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🔄 SAFE UPDATE - Processing remaining bookings from August 2025+');
  
  try {
    await connectPrisma();
    console.log('✅ Connected to database');

    const client = getBeds24Client();
    console.log('✅ Beds24 client ready');

    // Obtener bookings que necesitan actualización
    console.log('📥 Fetching bookings from August 2025+...');
    
    let allBookings: any[] = [];
    let offset = 0;
    const batchSize = 100;
    let hasMore = true;

    while (hasMore && allBookings.length < 200) {
      console.log(`📦 Fetching batch: offset ${offset}`);
      
      const batch = await client.getBookings({
        modifiedSince: '2025-08-01',
        limit: batchSize,
        offset: offset
      });

      if (batch.length === 0) {
        hasMore = false;
        console.log('📋 No more bookings');
      } else {
        allBookings.push(...batch);
        offset += batchSize;
        console.log(`✅ Got ${batch.length} bookings, total: ${allBookings.length}`);
        await delay(1000);
      }
    }

    console.log(`\\n📊 Total fetched: ${allBookings.length} bookings`);

    if (allBookings.length === 0) {
      console.log('⚠️ No bookings to process');
      return;
    }

    // Procesar con campos básicos solamente
    console.log('\\n🔄 Processing with SAFE field mapping...');
    
    let processed = 0;
    let updated = 0;
    let created = 0;
    let errors = 0;

    for (const booking of allBookings) {
      try {
        const bookingId = booking.id?.toString();
        if (!bookingId) continue;

        // SOLO campos básicos y seguros
        const safeData = {
          bookingId: bookingId,
          phone: booking.phone || null,
          guestName: booking.guestName || booking.firstName || null,
          status: booking.status || null,
          propertyName: booking.propertyName || null,
          arrivalDate: booking.arrival || null,
          departureDate: booking.departure || null,
          numNights: booking.numNights || null,
          totalPersons: (booking.numAdult || 0) + (booking.numChild || 0) || null,
          totalCharges: booking.totalPrice?.toString() || booking.price?.toString() || null,
          channel: booking.channel || booking.referer || null,
          email: booking.email || null,
          notes: booking.comments || booking.notes || null,
          bookingDate: booking.bookingTime || booking.created || null,
          modifiedDate: booking.modifiedTime || booking.modified || null,
          lastUpdatedBD: new Date(),
          raw: booking
        };

        // Verificar si existe
        const existing = await prisma.booking.findUnique({
          where: { bookingId }
        });

        if (existing) {
          // Solo UPDATE - no CREATE para evitar conflictos
          await prisma.booking.update({
            where: { bookingId },
            data: safeData
          });
          updated++;
          console.log(`🔄 ${bookingId} [${booking.status}] - UPDATED`);
        } else {
          // CREATE con datos básicos
          await prisma.booking.create({
            data: safeData
          });
          created++;
          console.log(`✨ ${bookingId} [${booking.status}] - CREATED`);
        }
        
        processed++;

        if (processed % 25 === 0) {
          const progress = ((processed/allBookings.length)*100).toFixed(1);
          console.log(`📊 Progress: ${processed}/${allBookings.length} (${progress}%) | Created: ${created} | Updated: ${updated}`);
        }

      } catch (error: any) {
        errors++;
        console.log(`❌ Error ${booking.id}: ${error.message}`);
      }

      await delay(100);
    }

    // Resumen final
    console.log('\\n' + '='.repeat(50));
    console.log('🏆 SAFE UPDATE COMPLETED');
    console.log('='.repeat(50));
    console.log(`📊 RESULTS:`);
    console.log(`   • Total processed: ${processed}/${allBookings.length}`);
    console.log(`   • Created: ${created}`);
    console.log(`   • Updated: ${updated}`);
    console.log(`   • Errors: ${errors}`);
    console.log(`   • Success rate: ${((processed/(processed + errors))*100).toFixed(1)}%`);

  } catch (error: any) {
    console.error('❌ Safe update failed:', error.message);
    process.exit(1);
  }
}

main();