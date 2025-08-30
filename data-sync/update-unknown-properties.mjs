#!/usr/bin/env node

// Script to update all bookings with "Unknown Property" using the new mapping
import { connectPrisma } from './dist/infra/db/prisma.client.js';
import { prisma } from './dist/infra/db/prisma.client.js';

const propertyMap = {
  '173207': '2005-A',
  '173307': '1820',
  '173308': '1317',
  '173309': '1722-B',
  '173311': '2005-B',
  '173312': '1722-A',
  '240061': '0715',
  '280243': 'punta arena tierra bomba' // Added from logs
};

async function updateBookings() {
  try {
    await connectPrisma();
    console.log('✅ Connected to database');
    
    // Get all bookings with "Unknown Property"
    const bookings = await prisma.booking.findMany({
      where: {
        propertyName: 'Unknown Property'
      },
      select: {
        id: true,
        bookingId: true,
        raw: true
      }
    });
    
    console.log(`Found ${bookings.length} bookings to update\n`);
    
    let updated = 0;
    let notFound = 0;
    let errors = 0;
    
    for (const booking of bookings) {
      try {
        // Extract propertyId from raw data
        const raw = booking.raw;
        const propertyId = raw?.propertyId || raw?.booking?.propertyId;
        
        if (!propertyId) {
          console.log(`❌ No propertyId found for booking ${booking.bookingId}`);
          notFound++;
          continue;
        }
        
        const propertyName = propertyMap[String(propertyId)];
        
        if (!propertyName) {
          console.log(`⚠️  No mapping for propertyId ${propertyId} (booking ${booking.bookingId})`);
          notFound++;
          continue;
        }
        
        // Update the booking (only propertyName, no date update)
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            propertyName
          }
        });
        
        updated++;
        console.log(`✅ Updated booking ${booking.bookingId}: ${propertyName}`);
        
      } catch (error) {
        errors++;
        console.error(`❌ Error updating booking ${booking.bookingId}:`, error.message);
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`  Total: ${bookings.length}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Not found/No mapping: ${notFound}`);
    console.log(`  Errors: ${errors}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateBookings();