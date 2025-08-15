#!/usr/bin/env tsx

/**
 * Script simple para verificar qué reservas hay desde agosto 2025
 */

import { getBeds24Client } from '../src/providers/beds24/client.js';
import { connectPrisma } from '../src/infra/db/prisma.client.js';

async function main() {
  console.log('🔍 Checking bookings from August 2025 onwards...');
  
  try {
    // Conectar BD
    await connectPrisma();
    console.log('✅ Connected to database');

    // Obtener cliente Beds24
    const client = getBeds24Client();
    console.log('✅ Beds24 client ready');

    // Test 1: Obtener reservas modificadas desde agosto
    console.log('\n📅 Test 1: Bookings modified since August 1, 2025');
    
    const bookingsModified = await client.getBookings({
      modifiedSince: '2025-08-01',
      limit: 10
    });
    
    console.log(`📊 Found ${bookingsModified.length} bookings modified since Aug 1`);
    
    if (bookingsModified.length > 0) {
      console.log('\n📋 Sample bookings:');
      bookingsModified.slice(0, 5).forEach((booking, i) => {
        console.log(`${i + 1}. ID: ${booking.id} | Status: ${booking.status} | Guest: ${booking.guestName || 'N/A'}`);
        console.log(`   Arrival: ${booking.arrival} | Modified: ${booking.modifiedTime}`);
      });
    }

    // Test 2: Obtener por rango de fechas de llegada
    console.log('\n📅 Test 2: Bookings arriving August-December 2025');
    
    const bookingsArriving = await client.getBookings({
      arrivalFrom: '2025-08-01',
      arrivalTo: '2025-12-31', 
      limit: 10
    });
    
    console.log(`📊 Found ${bookingsArriving.length} bookings arriving Aug-Dec 2025`);
    
    if (bookingsArriving.length > 0) {
      console.log('\n📋 Sample arrival bookings:');
      bookingsArriving.slice(0, 5).forEach((booking, i) => {
        console.log(`${i + 1}. ID: ${booking.id} | Status: ${booking.status} | Guest: ${booking.guestName || 'N/A'}`);
        console.log(`   Arrival: ${booking.arrival} | Departure: ${booking.departure}`);
      });
    }

    // Test 3: Reservas recientes (últimos días)
    console.log('\n📅 Test 3: Recent bookings (filter=new)');
    
    const recentBookings = await client.getBookings({
      limit: 5
    });
    
    console.log(`📊 Found ${recentBookings.length} recent bookings`);
    
    if (recentBookings.length > 0) {
      console.log('\n📋 Most recent bookings:');
      recentBookings.slice(0, 3).forEach((booking, i) => {
        console.log(`${i + 1}. ID: ${booking.id} | Status: ${booking.status}`);
        console.log(`   Created: ${booking.bookingTime} | Modified: ${booking.modifiedTime}`);
      });
    }

    console.log('\n✅ Check completed successfully');

  } catch (error: any) {
    console.error('❌ Check failed:', error.message);
    process.exit(1);
  }
}

main();