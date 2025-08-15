#!/usr/bin/env tsx

/**
 * Verificar cuántas reservas se actualizaron en tabla Booking
 */

import { connectPrisma, prisma } from '../src/infra/db/prisma.client.js';

async function main() {
  console.log('📊 Checking Booking table updates...');
  
  try {
    await connectPrisma();
    console.log('✅ Connected to database');

    // Total de bookings
    const total = await prisma.booking.count();
    console.log(`📋 Total bookings in table: ${total}`);

    // Bookings actualizados recientemente (hoy)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const updatedToday = await prisma.booking.count({
      where: {
        lastUpdatedBD: {
          gte: today
        }
      }
    });
    console.log(`🔄 Bookings updated today: ${updatedToday}`);

    // Booking por status
    const statusCounts = await prisma.booking.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    });

    console.log('\n📊 Bookings by status:');
    statusCounts.forEach(item => {
      console.log(`   ${item.status || 'null'}: ${item._count.status}`);
    });

    // Bookings con fechas recientes (agosto 2025+)
    const recentBookings = await prisma.booking.count({
      where: {
        OR: [
          {
            arrivalDate: {
              gte: '2025-08-01'
            }
          },
          {
            modifiedDate: {
              gte: '2025-08-01'
            }
          }
        ]
      }
    });
    console.log(`\n📅 Bookings from August 2025+: ${recentBookings}`);

    // Sample de bookings más recientes
    const latestBookings = await prisma.booking.findMany({
      orderBy: {
        lastUpdatedBD: 'desc'
      },
      take: 5,
      select: {
        bookingId: true,
        status: true,
        arrivalDate: true,
        lastUpdatedBD: true
      }
    });

    console.log('\n📋 Latest updated bookings:');
    latestBookings.forEach((booking, i) => {
      console.log(`${i + 1}. ${booking.bookingId} [${booking.status}] - ${booking.arrivalDate} (updated: ${booking.lastUpdatedBD.toISOString()})`);
    });

  } catch (error: any) {
    console.error('❌ Check failed:', error.message);
  }
}

main();