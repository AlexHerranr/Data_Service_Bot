#!/usr/bin/env node

/**
 * Ejecutable directo para sincronizar reservas
 * Desde 1 mes atrás hasta 1 año adelante
 */

import { getBeds24Client } from './dist/providers/beds24/client.js';
import { processSingleBookingData } from './dist/providers/beds24/sync.js';
import { connectPrisma } from './dist/infra/db/prisma.client.js';
import { prisma } from './dist/infra/db/prisma.client.js';

// Date range
const today = new Date();
const fromDate = new Date(today);
fromDate.setMonth(fromDate.getMonth() - 1);
const toDate = new Date(today);
toDate.setFullYear(toDate.getFullYear() + 1);

const stats = {
  total: 0,
  processed: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
  rateLimits: 0,
  startTime: Date.now()
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function handleRateLimit() {
  stats.rateLimits++;
  console.log(`\n⚠️  RATE LIMIT HIT #${stats.rateLimits} - Waiting 6 minutes...`);
  
  for (let i = 6; i > 0; i--) {
    console.log(`   ⏳ ${i} minute${i > 1 ? 's' : ''} remaining...`);
    if (i > 1) await delay(60000);
  }
  
  console.log('   ✅ Resuming...\n');
}

async function fetchBatch(client, offset, limit = 100) {
  const params = new URLSearchParams({
    arrivalFrom: fromDate.toISOString(),
    arrivalTo: toDate.toISOString(),
    modifiedFrom: fromDate.toISOString(),
    offset: offset.toString(),
    limit: limit.toString(),
    includeInvoiceItems: 'true',
    includeInfoItems: 'true',
    includeMessages: 'true'
  });
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await client.makeRequest({
        method: 'GET',
        url: `/bookings?${params.toString()}`
      });
      return response.data.data || [];
    } catch (error) {
      const isRateLimit = error.response?.status === 429 || 
                          error.message?.includes('rate') ||
                          error.message?.includes('Too many');
      
      if (isRateLimit) {
        await handleRateLimit();
        continue;
      }
      
      if (attempt < 3) {
        console.log(`   Retry ${attempt}/3 after error: ${error.message}`);
        await delay(Math.pow(2, attempt) * 1000);
      } else {
        throw error;
      }
    }
  }
  return [];
}

async function main() {
  try {
    console.log(`
╔═══════════════════════════════════════════════╗
║     BEDS24 SYNC: LAST MONTH → NEXT YEAR      ║
╚═══════════════════════════════════════════════╝

📅 Date Range: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}
`);
    
    // Connect
    await connectPrisma();
    console.log('✅ Database connected');
    
    const client = getBeds24Client();
    console.log('✅ Beds24 client ready\n');
    
    // Fetch all bookings
    console.log('📥 FETCHING BOOKINGS...\n');
    let allBookings = [];
    let offset = 0;
    let batchNum = 1;
    
    while (true) {
      console.log(`   Batch ${batchNum}...`);
      const batch = await fetchBatch(client, offset);
      
      if (batch.length === 0) break;
      
      allBookings.push(...batch);
      offset += batch.length;
      batchNum++;
      
      console.log(`   ✓ Got ${batch.length} bookings (Total: ${allBookings.length})`);
      await delay(1000);
    }
    
    stats.total = allBookings.length;
    console.log(`\n✅ FETCHED ${stats.total} BOOKINGS\n`);
    
    if (stats.total === 0) {
      console.log('No bookings found!');
      return;
    }
    
    // Process bookings
    console.log('🔄 PROCESSING BOOKINGS...\n');
    
    for (let i = 0; i < allBookings.length; i++) {
      const booking = allBookings[i];
      
      try {
        const result = await processSingleBookingData(booking);
        stats.processed++;
        
        if (result.action === 'created') {
          stats.created++;
          console.log(`   ✅ Created: ${booking.id} - ${booking.firstName || 'Guest'}`);
        } else if (result.action === 'updated') {
          stats.updated++;
          if (stats.updated % 10 === 0) {
            console.log(`   📝 Updated ${stats.updated} bookings...`);
          }
        } else {
          stats.skipped++;
        }
        
      } catch (error) {
        stats.errors++;
        console.log(`   ❌ Error: ${booking.id} - ${error.message}`);
      }
      
      // Progress every 50
      if ((i + 1) % 50 === 0) {
        const percent = Math.round((i + 1) / stats.total * 100);
        const elapsed = Math.round((Date.now() - stats.startTime) / 60000);
        console.log(`\n📊 PROGRESS: ${i + 1}/${stats.total} (${percent}%) - ${elapsed} minutes\n`);
      }
      
      // Small delay every 10 bookings
      if ((i + 1) % 10 === 0) {
        await delay(500);
      }
    }
    
    // Final stats
    const totalTime = Math.round((Date.now() - stats.startTime) / 60000);
    
    console.log(`
═══════════════════════════════════════════════
✅ SYNC COMPLETED IN ${totalTime} MINUTES!
═══════════════════════════════════════════════
📊 Results:
   Total:     ${stats.total}
   Processed: ${stats.processed}
   Created:   ${stats.created}
   Updated:   ${stats.updated}
   Skipped:   ${stats.skipped}
   Errors:    ${stats.errors}
   
   Rate Limits: ${stats.rateLimits}
   Success Rate: ${Math.round((stats.processed - stats.errors) / stats.total * 100)}%
═══════════════════════════════════════════════
`);
    
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();