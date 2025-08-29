require('dotenv').config({ path: '/workspace/.env' });
const { Client } = require('pg');

async function checkBookings() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('=== VERIFICANDO RESERVAS EN LA BASE DE DATOS ===\n');
    
    // Buscar las dos reservas mencionadas
    const bookingIds = ['74941539', '74943974'];
    
    for (const bookingId of bookingIds) {
      const query = `
        SELECT 
          "bookingId",
          "guestName",
          status,
          "propertyName",
          "arrivalDate",
          "departureDate",
          "totalPersons",
          channel,
          "bookingDate",
          "modifiedDate",
          "lastUpdatedBD",
          "totalCharges",
          "totalPayments",
          balance,
          notes,
          charges,
          payments
        FROM "Booking"
        WHERE "bookingId" = $1
      `;
      
      const result = await client.query(query, [bookingId]);
      
      if (result.rows.length > 0) {
        const booking = result.rows[0];
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
    const latestQuery = `
      SELECT 
        "bookingId",
        "guestName",
        status,
        "propertyName",
        "lastUpdatedBD",
        "modifiedDate",
        "bookingDate"
      FROM "Booking"
      ORDER BY "lastUpdatedBD" DESC
      LIMIT 5
    `;
    
    const latestResult = await client.query(latestQuery);
    
    latestResult.rows.forEach(booking => {
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
    await client.end();
  }
}

checkBookings();