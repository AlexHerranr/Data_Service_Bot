#!/usr/bin/env tsx

/**
 * Bulk update usando solo los datos del listado (sin consultar bookings individuales)
 */

import { getBeds24Client } from '../src/providers/beds24/client.js';
import { connectPrisma, prisma } from '../src/infra/db/prisma.client.js';
import { logger } from '../src/utils/logger.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🚀 Bulk update from listing data - August 2025 to December 2026');
  
  try {
    // Conectar BD
    await connectPrisma();
    console.log('✅ Connected to database');

    // Obtener cliente Beds24
    const client = getBeds24Client();
    console.log('✅ Beds24 client ready');

    console.log('\n📥 Fetching bookings in batches...');
    
    let allBookings: any[] = [];
    let offset = 0;
    const batchSize = 100;
    let hasMore = true;

    // Fetch todas las reservas en el rango
    while (hasMore) {
      console.log(`📦 Fetching batch: offset ${offset}, limit ${batchSize}`);
      
      const batch = await client.getBookings({
        modifiedSince: '2025-08-01', // Modificadas desde agosto
        limit: batchSize,
        offset: offset
      });

      if (batch.length === 0) {
        hasMore = false;
        console.log('📋 No more bookings found');
      } else {
        allBookings.push(...batch);
        offset += batchSize;
        console.log(`✅ Got ${batch.length} bookings, total: ${allBookings.length}`);
        
        // Rate limiting
        await delay(1000);
      }

      // Límite de seguridad  
      if (allBookings.length > 500) {
        console.log('🛑 Safety limit reached (500 bookings), stopping fetch');
        break;
      }
    }

    console.log(`\n📊 Total bookings fetched: ${allBookings.length}`);

    if (allBookings.length === 0) {
      console.log('⚠️ No bookings to process');
      return;
    }

    // Procesar directamente con los datos del listado
    console.log('\n🔄 Processing bookings with list data...');
    
    let processed = 0;
    let updated = 0;
    let created = 0;
    let errors = 0;

    for (const booking of allBookings) {
      try {
        const bookingId = booking.id?.toString();
        if (!bookingId) {
          console.log('⚠️ Skipping booking without ID');
          continue;
        }

        console.log(`🔄 Processing ${bookingId}...`);

        // Usar datos del listado directamente (sin API call individual)
        const bookingData = {
          bookingId: bookingId,
          phone: booking.phone || null,
          guestName: booking.guestName || null,
          status: booking.status || null,
          propertyName: booking.propertyName || null,
          arrivalDate: booking.arrival || null,
          departureDate: booking.departure || null,
          numNights: booking.numNights || null,
          totalPersons: (booking.numAdult || 0) + (booking.numChild || 0) || null,
          totalCharges: booking.totalPrice?.toString() || null,
          channel: booking.channel || null,
          email: booking.email || null,
          notes: booking.comments || null,
          bookingDate: booking.bookingTime || null,
          modifiedDate: booking.modifiedTime || null,
          lastUpdatedBD: new Date(),
          raw: booking // Guardar data completa
        };

        // Upsert en BD
        const existing = await prisma.booking.findUnique({
          where: { bookingId }
        });

        await prisma.booking.upsert({
          where: { bookingId },
          create: bookingData,
          update: bookingData
        });

        if (existing) {
          updated++;
          console.log(`✅ ${bookingId} - updated`);
        } else {
          created++;
          console.log(`✅ ${bookingId} - created`);
        }
        
        processed++;
        
        // Progress cada 10
        if (processed % 10 === 0) {
          console.log(`📊 Progress: ${processed}/${allBookings.length} (${((processed/allBookings.length)*100).toFixed(1)}%)`);
        }

      } catch (error: any) {
        errors++;
        console.log(`❌ Error processing ${booking.id}: ${error.message}`);
      }
    }

    console.log('\n📊 Final Summary:');
    console.log(`- Total fetched: ${allBookings.length}`);
    console.log(`- Processed: ${processed}`);
    console.log(`- Created: ${created}`);
    console.log(`- Updated: ${updated}`); 
    console.log(`- Errors: ${errors}`);
    console.log(`- Success rate: ${((processed/allBookings.length)*100).toFixed(1)}%`);

  } catch (error: any) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

main();