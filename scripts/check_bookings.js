const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBookings() {
  try {
    // Buscar las dos reservas mencionadas
    const bookingIds = ['74941539', '74943974'];
    
    console.log('=== VERIFICANDO RESERVAS EN LA BASE DE DATOS ===\n');
    
    for (const bookingId of bookingIds) {
      const booking = await prisma.booking.findUnique({
        where: { bookingId: bookingId }
      });
      
      if (booking) {
        console.log(`✅ Reserva ${bookingId} encontrada:`);
        console.log('  - Nombre del huésped:', booking.guestName);
        console.log('  - Estado:', booking.status);
        console.log('  - Propiedad:', booking.propertyName);
        console.log('  - Fecha llegada:', booking.arrivalDate);
        console.log('  - Fecha salida:', booking.departureDate);
        console.log('  - Total personas:', booking.totalPersons);
        console.log('  - Canal:', booking.channel);
        console.log('  - Fecha de reserva:', booking.bookingDate);
        console.log('  - Fecha de modificación:', booking.modifiedDate);
        console.log('  - Última actualización BD:', booking.lastUpdatedBD);
        console.log('  - Total cargos:', booking.totalCharges);
        console.log('  - Total pagos:', booking.totalPayments);
        console.log('  - Balance:', booking.balance);
        console.log('  - Notas:', booking.notes);
        
        // Mostrar cargos
        if (booking.charges && Array.isArray(booking.charges)) {
          console.log('  - Cargos:');
          booking.charges.forEach(charge => {
            console.log(`    • ${charge.description}: ${charge.amount}`);
          });
        }
        
        // Mostrar pagos
        if (booking.payments && Array.isArray(booking.payments)) {
          console.log('  - Pagos:');
          booking.payments.forEach(payment => {
            console.log(`    • ${payment.description}: ${payment.amount}`);
          });
        }
        
        console.log('\n' + '-'.repeat(60) + '\n');
      } else {
        console.log(`❌ Reserva ${bookingId} NO encontrada en la base de datos\n`);
      }
    }
    
    // Verificar las últimas reservas creadas/modificadas
    console.log('=== ÚLTIMAS 5 RESERVAS MODIFICADAS ===\n');
    const latestBookings = await prisma.booking.findMany({
      orderBy: { lastUpdatedBD: 'desc' },
      take: 5,
      select: {
        bookingId: true,
        guestName: true,
        status: true,
        propertyName: true,
        lastUpdatedBD: true,
        modifiedDate: true,
        bookingDate: true
      }
    });
    
    latestBookings.forEach(booking => {
      console.log(`Booking ID: ${booking.bookingId}`);
      console.log(`  Huésped: ${booking.guestName}`);
      console.log(`  Propiedad: ${booking.propertyName}`);
      console.log(`  Estado: ${booking.status}`);
      console.log(`  Fecha reserva: ${booking.bookingDate}`);
      console.log(`  Última modificación: ${booking.modifiedDate}`);
      console.log(`  Actualizado en BD: ${booking.lastUpdatedBD}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error al consultar la base de datos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBookings();