#!/usr/bin/env node

// Test script to get properties using the existing client
import { getBeds24Client } from './dist/providers/beds24/client.js';
import { connectPrisma } from './dist/infra/db/prisma.client.js';
import { prisma } from './dist/infra/db/prisma.client.js';

async function main() {
  try {
    // Connect to DB to get cached token
    await connectPrisma();
    console.log('✅ Connected to database');
    
    // Initialize client (will use cached token from Redis)
    const client = getBeds24Client();
    console.log('✅ Beds24 client initialized');
    
    // Get properties
    console.log('📋 Fetching properties...');
    const properties = await client.getProperties();
    
    if (!Array.isArray(properties)) {
      console.error('Invalid response:', properties);
      return;
    }
    
    console.log(`\nFound ${properties.length} properties:\n`);
    
    // Build mapping
    const mapping = {};
    
    for (const prop of properties) {
      if (prop.id && prop.name) {
        mapping[prop.id] = prop.name;
        console.log(`Property ${prop.id}: ${prop.name}`);
        
        // Check for rooms
        if (prop.rooms && Array.isArray(prop.rooms)) {
          for (const room of prop.rooms) {
            if (room.id && room.name) {
              mapping[room.id] = `${prop.name} - ${room.name}`;
              console.log(`  Room ${room.id}: ${room.name}`);
            }
          }
        }
      }
    }
    
    // Generate code for utils.ts
    console.log('\n📝 Copy this mapping to utils.ts:\n');
    console.log('  const propertyMap: Record<string, string> = {');
    
    for (const [id, name] of Object.entries(mapping)) {
      const safeName = name.replace(/'/g, "\\'");
      console.log(`    '${id}': '${safeName}',`);
    }
    
    console.log('  };');
    
    // Count bookings with "Unknown Property"
    const unknownCount = await prisma.booking.count({
      where: { propertyName: 'Unknown Property' }
    });
    
    console.log(`\n📊 Found ${unknownCount} bookings with "Unknown Property" that need updating`);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();