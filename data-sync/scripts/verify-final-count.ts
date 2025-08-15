#!/usr/bin/env tsx
/**
 * VERIFICACIÓN FINAL - Contar reservas únicas desde agosto 2025+
 */
import { connectPrisma, prisma } from '../src/infra/db/prisma.client.js';

async function main() {
  console.log('🔍 VERIFICACIÓN FINAL - Bookings únicos desde agosto 2025+');
  
  await connectPrisma();
  console.log('✅ Connected to database');

  // 1. Total bookings en la tabla
  const totalBookings = await prisma.booking.count();
  console.log(`📊 Total bookings in table: ${totalBookings}`);

  // 2. Bookings únicos (verificar que no hay duplicados por bookingId)
  const uniqueBookingIds = await prisma.booking.groupBy({
    by: ['bookingId'],
    _count: { bookingId: true }
  });
  
  const duplicates = uniqueBookingIds.filter(group => group._count.bookingId > 1);
  console.log(`🔑 Unique booking IDs: ${uniqueBookingIds.length}`);
  console.log(`⚠️ Duplicate booking IDs: ${duplicates.length}`);
  
  if (duplicates.length > 0) {
    console.log('❌ DUPLICATES FOUND:', duplicates.slice(0, 5));
  }

  // 3. Bookings desde agosto 2025+ por fecha de llegada (usando arrivalDate como string)
  const bookingsFromAug2025Arrival = await prisma.booking.count({
    where: {
      arrivalDate: {
        gte: '2025-08-01'
      }
    }
  });
  console.log(`📅 Bookings with arrival >= Aug 1, 2025: ${bookingsFromAug2025Arrival}`);

  // 4. Bookings modificados desde agosto 2025+ (usando modifiedDate como string)
  const bookingsModifiedSinceAug = await prisma.booking.count({
    where: {
      modifiedDate: {
        gte: '2025-08-01'
      }
    }
  });
  console.log(`📝 Bookings modified since Aug 1, 2025: ${bookingsModifiedSinceAug}`);

  // 5. Bookings actualizados HOY
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const updatedToday = await prisma.booking.count({
    where: {
      lastUpdatedBD: {
        gte: today
      }
    }
  });
  console.log(`🆕 Bookings updated today: ${updatedToday}`);

  // 6. Distribution por status
  const statusDistribution = await prisma.booking.groupBy({
    by: ['status'],
    _count: { status: true },
    orderBy: { _count: { status: 'desc' } }
  });
  
  console.log('\n📋 STATUS DISTRIBUTION:');
  statusDistribution.forEach(group => {
    console.log(`   ${group.status}: ${group._count.status}`);
  });

  // 7. Ejemplos de fechas más recientes
  const recentBookings = await prisma.booking.findMany({
    where: {
      arrivalDate: {
        gte: '2025-08-01'
      }
    },
    select: {
      bookingId: true,
      arrivalDate: true,
      status: true,
      lastUpdatedBD: true
    },
    orderBy: { arrivalDate: 'desc' },
    take: 5
  });

  console.log('\n📅 RECENT BOOKINGS SAMPLE:');
  recentBookings.forEach(booking => {
    console.log(`   ID: ${booking.bookingId}, Arrival: ${booking.arrivalDate}, Status: ${booking.status}, Updated: ${booking.lastUpdatedBD?.toISOString().split('T')[0]}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);