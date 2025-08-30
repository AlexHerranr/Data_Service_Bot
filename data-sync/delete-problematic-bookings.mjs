#!/usr/bin/env node

// Delete problematic bookings so they can be re-synced
import { connectPrisma } from './dist/infra/db/prisma.client.js';
import { prisma } from './dist/infra/db/prisma.client.js';

async function deleteProblematicBookings() {
  try {
    await connectPrisma();
    console.log('✅ Conectado a la base de datos\n');
    
    // Get bookings with Unknown Property
    const problematicBookings = await prisma.booking.findMany({
      where: { 
        propertyName: 'Unknown Property' 
      },
      select: {
        id: true,
        bookingId: true
      }
    });
    
    console.log(`🗑️  Encontradas ${problematicBookings.length} reservas problemáticas\n`);
    
    if (problematicBookings.length === 0) {
      console.log('No hay reservas para eliminar');
      return;
    }
    
    // Save the booking IDs for reference
    const bookingIds = problematicBookings.map(b => b.bookingId);
    console.log('IDs de reservas a eliminar:', bookingIds.join(', '));
    console.log('');
    
    // Delete them
    const deleteResult = await prisma.booking.deleteMany({
      where: {
        propertyName: 'Unknown Property'
      }
    });
    
    console.log(`✅ Eliminadas ${deleteResult.count} reservas problemáticas\n`);
    
    console.log(`
Estas reservas se volverán a sincronizar correctamente
cuando ejecutes el script de sincronización nuevamente.

Los IDs eliminados fueron:
${bookingIds.join('\n')}
`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteProblematicBookings();