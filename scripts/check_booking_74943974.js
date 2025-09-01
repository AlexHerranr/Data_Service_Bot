const { PrismaClient } = require('@prisma/client');

async function checkBooking() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  try {
    console.log('🔍 Buscando reserva 74943974 en la base de datos...\n');
    
    // Buscar la reserva específica
    const booking = await prisma.booking.findUnique({
      where: { bookingId: '74943974' }
    });
    
    if (booking) {
      console.log('✅ RESERVA 74943974 ENCONTRADA EN LA BASE DE DATOS!\n');
      console.log('Detalles de la reserva:');
      console.log('========================');
      console.log('ID en BD:', booking.id);
      console.log('Booking ID:', booking.bookingId);
      console.log('Nombre del huésped:', booking.guestName);
      console.log('Estado:', booking.status);
      console.log('Propiedad:', booking.propertyName);
      console.log('Fecha llegada:', booking.arrivalDate);
      console.log('Fecha salida:', booking.departureDate);
      console.log('Total personas:', booking.totalPersons);
      console.log('Canal:', booking.channel);
      console.log('Fecha de reserva:', booking.bookingDate);
      console.log('Fecha de modificación:', booking.modifiedDate);
      console.log('Última actualización BD:', booking.lastUpdatedBD);
      console.log('Total cargos:', booking.totalCharges);
      console.log('Total pagos:', booking.totalPayments);
      console.log('Balance:', booking.balance);
      console.log('Notas:', booking.notes);
      console.log('BD Status:', booking.BDStatus);
      
      // Mostrar cargos si existen
      if (booking.charges && Array.isArray(booking.charges)) {
        console.log('\nCargos:');
        booking.charges.forEach(charge => {
          console.log(`  - ${charge.description}: $${charge.amount}`);
        });
      }
      
      // Calcular tiempo desde que se procesó
      const now = new Date();
      const lastUpdate = new Date(booking.lastUpdatedBD);
      const diffMinutes = Math.floor((now - lastUpdate) / 60000);
      console.log(`\n⏱️ Última actualización hace ${diffMinutes} minutos`);
      
    } else {
      console.log('❌ RESERVA 74943974 NO ENCONTRADA EN LA BASE DE DATOS\n');
      
      // Buscar las últimas 10 reservas para ver qué hay
      console.log('Mostrando las últimas 10 reservas en la BD:\n');
      const latestBookings = await prisma.booking.findMany({
        orderBy: { lastUpdatedBD: 'desc' },
        take: 10,
        select: {
          bookingId: true,
          guestName: true,
          propertyName: true,
          lastUpdatedBD: true,
          status: true
        }
      });
      
      latestBookings.forEach((b, index) => {
        console.log(`${index + 1}. Booking ${b.bookingId}`);
        console.log(`   Huésped: ${b.guestName}`);
        console.log(`   Propiedad: ${b.propertyName}`);
        console.log(`   Estado: ${b.status}`);
        console.log(`   Actualizado: ${b.lastUpdatedBD}`);
        console.log('');
      });
      
      // Buscar si existe con otro formato o similar
      console.log('\nBuscando reservas que contengan "74943974"...');
      const similarBookings = await prisma.booking.findMany({
        where: {
          OR: [
            { bookingId: { contains: '74943974' } },
            { apiReference: { contains: '74943974' } }
          ]
        }
      });
      
      if (similarBookings.length > 0) {
        console.log(`Encontradas ${similarBookings.length} reservas similares:`);
        similarBookings.forEach(b => {
          console.log(`  - BookingId: ${b.bookingId}, Guest: ${b.guestName}`);
        });
      } else {
        console.log('No se encontraron reservas similares.');
      }
    }
    
    // Contar total de reservas
    const totalCount = await prisma.booking.count();
    console.log(`\n📊 Total de reservas en la BD: ${totalCount}`);
    
  } catch (error) {
    console.error('❌ Error al consultar la base de datos:', error.message);
    console.error('Detalles:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Cargar variables de entorno
require('dotenv').config({ path: '/workspace/data-sync/.env' });

// Si no hay DATABASE_URL, intentar con el archivo .env principal
if (!process.env.DATABASE_URL) {
  require('dotenv').config({ path: '/workspace/.env' });
}

// Verificar que tenemos DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('❌ No se encontró DATABASE_URL en las variables de entorno');
  console.log('Buscando archivos .env...');
  const fs = require('fs');
  const path = require('path');
  
  const possiblePaths = [
    '/workspace/.env',
    '/workspace/data-sync/.env',
    '/workspace/.env.local',
    '/workspace/data-sync/.env.local'
  ];
  
  possiblePaths.forEach(p => {
    if (fs.existsSync(p)) {
      console.log(`  ✓ Encontrado: ${p}`);
    } else {
      console.log(`  ✗ No existe: ${p}`);
    }
  });
  
  process.exit(1);
}

console.log('🔌 Conectando a la base de datos...');
console.log(`   Host: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown'}\n`);

checkBooking();