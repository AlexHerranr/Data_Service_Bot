#!/usr/bin/env tsx
/**
 * DETECTAR RESERVAS FALTANTES
 * 
 * Compara Beds24 API vs tabla local para encontrar bookings que no llegaron via webhook
 */
import { getBeds24Client } from '../src/providers/beds24/client.js';
import { connectPrisma, prisma } from '../src/infra/db/prisma.client.js';

async function detectMissingBookings() {
  console.log('🔍 DETECTANDO RESERVAS FALTANTES...');
  
  await connectPrisma();
  const client = getBeds24Client();

  // 1. Obtener todas las reservas desde Beds24 (últimos 30 días)
  const beds24Bookings = await client.getBookings({
    modifiedSince: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    limit: 500
  });

  console.log(`📊 Beds24 API: ${beds24Bookings.length} bookings`);

  // 2. Obtener bookingIds de nuestra tabla local
  const localBookingIds = await prisma.booking.findMany({
    select: { bookingId: true },
    where: {
      modifiedDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] }
    }
  });

  const localIds = new Set(localBookingIds.map(b => b.bookingId));
  console.log(`💾 Local DB: ${localIds.size} bookings`);

  // 3. COMPARAR: Encontrar faltantes
  const missingBookings = beds24Bookings.filter(booking => 
    !localIds.has(booking.bookingId.toString())
  );

  console.log(`❌ MISSING: ${missingBookings.length} bookings not in local DB`);

  // 4. MOSTRAR faltantes
  if (missingBookings.length > 0) {
    console.log('\n🚨 MISSING BOOKINGS:');
    missingBookings.slice(0, 10).forEach(booking => {
      console.log(`   ID: ${booking.bookingId}, Status: ${booking.status}, Modified: ${booking.modifiedTime}`);
    });
    
    console.log(`\n💡 RECOMMENDATION: Run sync job for missing bookings`);
    console.log(`   Command: npm run sync:missing -- ${missingBookings.map(b => b.bookingId).join(',')}`);
  } else {
    console.log('✅ NO MISSING BOOKINGS - All synced correctly!');
  }

  await prisma.$disconnect();
  return missingBookings;
}

detectMissingBookings().catch(console.error);