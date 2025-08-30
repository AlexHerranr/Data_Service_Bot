#!/usr/bin/env tsx

/**
 * Script para actualizar el mapeo de propiedades desde Beds24
 * y actualizar todas las reservas con "Unknown Property"
 */

import { getBeds24Client } from '../src/providers/beds24/client.js';
import { connectPrisma } from '../src/infra/db/prisma.client.js';
import { prisma } from '../src/infra/db/prisma.client.js';
import { logger } from '../src/utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

interface PropertyInfo {
  id: number;
  name: string;
  roomId?: number;
  roomName?: string;
}

async function fetchAndSaveProperties(): Promise<Map<string, string>> {
  const client = getBeds24Client();
  const propertyMap = new Map<string, string>();
  
  try {
    logger.info('Fetching properties from Beds24...');
    const properties = await client.getProperties();
    
    if (!Array.isArray(properties)) {
      logger.error('Invalid response from Beds24 properties API');
      return propertyMap;
    }
    
    logger.info(`Found ${properties.length} properties`);
    
    // Build the mapping
    for (const prop of properties) {
      if (prop.id && prop.name) {
        propertyMap.set(String(prop.id), prop.name);
        logger.info(`Property ${prop.id}: ${prop.name}`);
        
        // Also map room IDs if available
        if (prop.rooms && Array.isArray(prop.rooms)) {
          for (const room of prop.rooms) {
            if (room.id && room.name) {
              propertyMap.set(String(room.id), `${prop.name} - ${room.name}`);
              logger.info(`  Room ${room.id}: ${room.name}`);
            }
          }
        }
      }
    }
    
    // Generate TypeScript code for the mapping
    const mapCode = generateMappingCode(propertyMap);
    
    // Update the utils.ts file
    const utilsPath = path.join(process.cwd(), 'src/providers/beds24/utils.ts');
    await updateUtilsFile(utilsPath, mapCode);
    
    logger.info(`Updated property mapping with ${propertyMap.size} entries`);
    
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch properties');
  }
  
  return propertyMap;
}

function generateMappingCode(propertyMap: Map<string, string>): string {
  const entries = Array.from(propertyMap.entries())
    .map(([id, name]) => `    '${id}': '${name.replace(/'/g, "\\'")}'`)
    .join(',\n');
    
  return `  const propertyMap: Record<string, string> = {\n${entries}\n  };`;
}

async function updateUtilsFile(filePath: string, newMapCode: string): Promise<void> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Find and replace the property map
    const mapRegex = /const propertyMap: Record<string, string> = \{[^}]*\};/s;
    
    if (!mapRegex.test(content)) {
      logger.error('Could not find propertyMap in utils.ts');
      return;
    }
    
    const updatedContent = content.replace(mapRegex, newMapCode);
    
    await fs.writeFile(filePath, updatedContent, 'utf-8');
    logger.info('Updated utils.ts with new property mapping');
    
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to update utils.ts');
  }
}

async function updateBookingsWithUnknownProperty(propertyMap: Map<string, string>): Promise<void> {
  try {
    logger.info('Fetching bookings with "Unknown Property"...');
    
    const bookingsToUpdate = await prisma.booking.findMany({
      where: {
        propertyName: 'Unknown Property'
      },
      select: {
        id: true,
        bookingId: true,
        raw: true
      }
    });
    
    logger.info(`Found ${bookingsToUpdate.length} bookings to update`);
    
    let updated = 0;
    let failed = 0;
    
    for (const booking of bookingsToUpdate) {
      try {
        // Extract propertyId from raw data
        const raw = booking.raw as any;
        const propertyId = raw?.propertyId || raw?.booking?.propertyId;
        
        if (propertyId) {
          const propertyName = propertyMap.get(String(propertyId));
          
          if (propertyName) {
            await prisma.booking.update({
              where: { id: booking.id },
              data: { 
                propertyName,
                lastUpdatedBD: new Date()
              }
            });
            
            updated++;
            logger.info(`Updated booking ${booking.bookingId}: ${propertyName}`);
          } else {
            logger.warn(`No mapping found for propertyId ${propertyId} in booking ${booking.bookingId}`);
          }
        } else {
          logger.warn(`No propertyId found in booking ${booking.bookingId}`);
        }
        
      } catch (error: any) {
        failed++;
        logger.error({ 
          bookingId: booking.bookingId, 
          error: error.message 
        }, 'Failed to update booking');
      }
    }
    
    logger.info({
      total: bookingsToUpdate.length,
      updated,
      failed
    }, 'Finished updating bookings');
    
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to update bookings');
  }
}

async function main() {
  try {
    // Connect to database
    await connectPrisma();
    logger.info('Connected to database');
    
    // Step 1: Fetch and save property mapping
    const propertyMap = await fetchAndSaveProperties();
    
    if (propertyMap.size === 0) {
      logger.error('No properties found, aborting');
      process.exit(1);
    }
    
    // Step 2: Update all bookings with "Unknown Property"
    await updateBookingsWithUnknownProperty(propertyMap);
    
    logger.info('✅ Property mapping update completed');
    
  } catch (error: any) {
    logger.error({ error: error.message }, 'Script failed');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main };