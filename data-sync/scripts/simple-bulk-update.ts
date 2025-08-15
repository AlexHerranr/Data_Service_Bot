#!/usr/bin/env tsx

/**
 * Script Simple de Actualización Masiva
 * Actualiza reservas desde agosto 2025 hasta diciembre 2026
 */

import { syncSingleBooking } from '../src/providers/beds24/sync.js';
import { getBeds24Client } from '../src/providers/beds24/client.js';
import { logger } from '../src/utils/logger.js';
import { connectPrisma } from '../src/infra/db/prisma.client.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🚀 Starting bulk update - August 2025 to December 2026');
  
  try {
    // Conectar BD
    await connectPrisma();
    console.log('✅ Connected to database');

    // Obtener cliente Beds24
    const client = getBeds24Client();
    console.log('✅ Beds24 client ready');

    // Fetch reservas con filtros de fecha
    console.log('📥 Fetching bookings from Beds24...');
    
    const bookings = await client.getBookings({
      modifiedSince: '2025-08-01', // Desde agosto 2025
      includeInvoice: true,
      includeInfoItems: true,
      includeComments: true,
      limit: 50
    });
    console.log(`📊 Found ${bookings.length} bookings to sync`);

    if (bookings.length === 0) {
      console.log('⚠️ No bookings found in date range');
      return;
    }

    // Procesar cada booking
    let processed = 0;
    let updated = 0;
    let created = 0;
    let errors = 0;

    for (const booking of bookings.slice(0, 10)) { // Solo primeros 10 para test
      try {
        const bookingId = booking.id?.toString();
        if (!bookingId) {
          console.log(`⚠️ Skipping booking without ID`);
          continue;
        }

        console.log(`🔄 Processing booking ${bookingId}...`);
        
        const result = await syncSingleBooking(bookingId);
        
        if (result.success) {
          if (result.action === 'created') created++;
          else if (result.action === 'updated') updated++;
          processed++;
          console.log(`✅ ${bookingId} - ${result.action} in ${result.table}`);
        } else {
          errors++;
          console.log(`❌ ${bookingId} - sync failed`);
        }

        // Rate limiting
        await delay(500);
        
      } catch (error: any) {
        errors++;
        console.log(`❌ Error processing ${booking.id}: ${error.message}`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`- Processed: ${processed}`);
    console.log(`- Created: ${created}`);
    console.log(`- Updated: ${updated}`); 
    console.log(`- Errors: ${errors}`);
    console.log(`- Total found: ${bookings.length}`);

  } catch (error: any) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

main();