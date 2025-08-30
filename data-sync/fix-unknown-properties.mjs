#!/usr/bin/env node

// Fix all Unknown Property bookings
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
  '280243': 'punta arena tierra bomba'
};

async function fixUnknownProperties() {
  try {
    await connectPrisma();
    console.log('✅ Conectado a la base de datos\n');
    
    // Get ALL bookings with Unknown Property
    const unknownBookings = await prisma.booking.findMany({
      where: { 
        propertyName: 'Unknown Property' 
      },
      select: {
        id: true,
        bookingId: true,
        raw: true,
        propertyName: true
      }
    });
    
    console.log(`📋 Encontradas ${unknownBookings.length} reservas con "Unknown Property"\n`);
    
    let fixed = 0;
    let notFound = 0;
    let errors = 0;
    
    for (const booking of unknownBookings) {
      try {
        // Get propertyId from raw data
        const raw = booking.raw;
        const propertyId = raw?.propertyId || raw?.booking?.propertyId;
        
        if (!propertyId) {
          console.log(`❌ Sin propertyId: ${booking.bookingId}`);
          notFound++;
          continue;
        }
        
        const correctName = propertyMap[String(propertyId)];
        
        if (!correctName) {
          console.log(`⚠️  Sin mapeo para propertyId ${propertyId}: ${booking.bookingId}`);
          notFound++;
          continue;
        }
        
        // Update ONLY the propertyName field
        await prisma.$executeRaw`
          UPDATE "Booking" 
          SET "propertyName" = ${correctName}
          WHERE id = ${booking.id}
        `;
        
        fixed++;
        console.log(`✅ Actualizada: ${booking.bookingId} → ${correctName}`);
        
      } catch (error) {
        errors++;
        console.log(`❌ Error con ${booking.bookingId}: ${error.message}`);
      }
    }
    
    console.log(`
════════════════════════════════
📊 RESULTADOS:
  Total: ${unknownBookings.length}
  ✅ Corregidas: ${fixed}
  ⚠️  Sin mapeo: ${notFound}
  ❌ Errores: ${errors}
════════════════════════════════
`);
    
    // Verify remaining
    const remaining = await prisma.booking.count({
      where: { propertyName: 'Unknown Property' }
    });
    
    console.log(`📌 Quedan ${remaining} reservas con "Unknown Property"`);
    
  } catch (error) {
    console.error('Error fatal:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixUnknownProperties();