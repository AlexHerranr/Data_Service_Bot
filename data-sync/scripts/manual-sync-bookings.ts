#!/usr/bin/env tsx
/**
 * SYNC MANUAL DE BOOKINGS ESPECÍFICOS
 * 
 * Sincroniza una lista de bookingIds específicos
 * Uso: npm run sync:manual -- 12345,67890,54321
 */
import { syncSingleBooking } from '../src/providers/beds24/sync.js';
import { connectPrisma } from '../src/infra/db/prisma.client.js';

async function syncManualBookings() {
  console.log('🔧 MANUAL SYNC - Specific booking IDs');
  
  // Obtener bookingIds de argumentos de línea de comandos
  const bookingIds = process.argv[2]?.split(',').map(id => id.trim()) || [];
  
  if (bookingIds.length === 0) {
    console.log('❌ No booking IDs provided');
    console.log('💡 Usage: npm run sync:manual -- 12345,67890,54321');
    process.exit(1);
  }

  console.log(`📋 Will sync ${bookingIds.length} bookings: ${bookingIds.join(', ')}`);
  
  await connectPrisma();
  console.log('✅ Connected to database');

  let success = 0;
  let errors = 0;

  for (const bookingId of bookingIds) {
    try {
      console.log(`🔄 Syncing booking ${bookingId}...`);
      
      const result = await syncSingleBooking(bookingId);
      
      if (result.success) {
        console.log(`✅ ${bookingId}: ${result.action} in ${result.table}`);
        success++;
      } else {
        console.log(`❌ ${bookingId}: Failed to sync`);
        errors++;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error: any) {
      console.log(`❌ ${bookingId}: Error - ${error.message}`);
      errors++;
    }
  }

  console.log('\n📊 MANUAL SYNC COMPLETED:');
  console.log(`✅ Success: ${success}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📋 Total: ${bookingIds.length}`);

  process.exit(0);
}

syncManualBookings().catch(console.error);