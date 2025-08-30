#!/usr/bin/env node

// Check current database status
import { connectPrisma } from './dist/infra/db/prisma.client.js';
import { prisma } from './dist/infra/db/prisma.client.js';

async function checkStatus() {
  try {
    await connectPrisma();
    
    console.log('\n📊 DATABASE STATUS\n');
    
    // Count total bookings
    const total = await prisma.booking.count();
    
    // Count by status
    const confirmed = await prisma.booking.count({
      where: { status: 'confirmed' }
    });
    
    const cancelled = await prisma.booking.count({
      where: { status: 'cancelled' }
    });
    
    // Count by property
    const properties = await prisma.booking.groupBy({
      by: ['propertyName'],
      _count: true,
      orderBy: {
        _count: {
          propertyName: 'desc'
        }
      }
    });
    
    // Recent bookings (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const recentlyUpdated = await prisma.booking.count({
      where: {
        lastUpdatedBD: {
          gte: yesterday
        }
      }
    });
    
    // Today's updates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayUpdated = await prisma.booking.count({
      where: {
        lastUpdatedBD: {
          gte: today
        }
      }
    });
    
    console.log(`Total Bookings: ${total}`);
    console.log(`  ✅ Confirmed: ${confirmed}`);
    console.log(`  ❌ Cancelled: ${cancelled}`);
    console.log(`  📝 Other: ${total - confirmed - cancelled}\n`);
    
    console.log('By Property:');
    for (const prop of properties.slice(0, 10)) {
      console.log(`  ${prop.propertyName}: ${prop._count}`);
    }
    
    console.log(`\nRecent Activity:`);
    console.log(`  📅 Updated Today: ${todayUpdated}`);
    console.log(`  📅 Updated Last 24h: ${recentlyUpdated}`);
    
    // Get a sample of recent bookings
    const recent = await prisma.booking.findMany({
      take: 5,
      orderBy: {
        lastUpdatedBD: 'desc'
      },
      select: {
        bookingId: true,
        guestName: true,
        propertyName: true,
        status: true,
        arrivalDate: true,
        lastUpdatedBD: true
      }
    });
    
    console.log('\nMost Recently Updated:');
    for (const booking of recent) {
      const time = new Date(booking.lastUpdatedBD).toLocaleString();
      console.log(`  ${booking.bookingId} - ${booking.guestName} - ${booking.propertyName} (${time})`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkStatus();