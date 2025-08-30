#!/usr/bin/env node

// Quick test to sync recent bookings
import { getBeds24Client } from './dist/providers/beds24/client.js';
import { processSingleBookingData } from './dist/providers/beds24/sync.js';
import { connectPrisma } from './dist/infra/db/prisma.client.js';
import { prisma } from './dist/infra/db/prisma.client.js';

async function quickSync() {
  try {
    console.log('\n🚀 QUICK SYNC TEST - Last 7 days\n');
    
    await connectPrisma();
    const client = getBeds24Client();
    
    // Get bookings from last 7 days
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    
    console.log('📥 Fetching recent bookings...\n');
    
    const bookings = await client.getBookings({
      modifiedFrom: fromDate.toISOString().split('T')[0],
      limit: 20  // Just get 20 for testing
    });
    
    console.log(`✅ Found ${bookings.length} recent bookings\n`);
    
    let created = 0, updated = 0, errors = 0;
    
    for (const booking of bookings) {
      try {
        const result = await processSingleBookingData(booking);
        
        if (result.action === 'created') {
          created++;
          console.log(`  ✅ CREATED: ${booking.id} - ${booking.firstName || 'Guest'} - Property: ${booking.propertyId}`);
        } else if (result.action === 'updated') {
          updated++;
          console.log(`  📝 UPDATED: ${booking.id} - ${booking.firstName || 'Guest'}`);
        }
      } catch (error) {
        errors++;
        console.log(`  ❌ ERROR: ${booking.id} - ${error.message}`);
      }
    }
    
    console.log(`
═════════════════════════
📊 RESULTS:
  Created: ${created}
  Updated: ${updated}
  Errors:  ${errors}
  Total:   ${bookings.length}
═════════════════════════
`);
    
  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

quickSync();