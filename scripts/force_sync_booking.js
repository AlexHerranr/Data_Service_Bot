// Script para forzar la sincronización de la reserva 74943974
const { syncSingleBooking } = require('../data-sync/dist/providers/beds24/sync.js');
const { logger } = require('../data-sync/dist/utils/logger.js');

async function forceSyncBooking() {
  const bookingId = '74943974';
  
  console.log('=' .repeat(60));
  console.log(`🔄 FORZANDO SINCRONIZACIÓN DE RESERVA ${bookingId}`);
  console.log('=' .repeat(60));
  console.log('');
  
  try {
    console.log('📡 Llamando a syncSingleBooking...');
    console.log('   Esto debería:');
    console.log('   1. Obtener los datos completos de Beds24');
    console.log('   2. Crear la reserva en la BD si no existe');
    console.log('   3. Actualizarla si ya existe');
    console.log('');
    
    const result = await syncSingleBooking(bookingId);
    
    console.log('\n📊 RESULTADO DE LA SINCRONIZACIÓN:');
    console.log('=' .repeat(40));
    console.log(`Success: ${result.success ? '✅ SÍ' : '❌ NO'}`);
    console.log(`Action: ${result.action}`);
    console.log(`Table: ${result.table}`);
    console.log('=' .repeat(40));
    
    if (result.success) {
      console.log('\n✅ La reserva debería estar ahora en la base de datos');
      console.log('   Verifica con: SELECT * FROM "Booking" WHERE "bookingId" = \'74943974\';');
    } else {
      console.log('\n❌ La sincronización falló');
      console.log('   Revisa los logs para más detalles');
    }
    
  } catch (error) {
    console.error('\n❌ ERROR al sincronizar:', error.message);
    console.error('Stack:', error.stack);
  }
  
  process.exit(0);
}

// Configurar variables de entorno
require('dotenv').config({ path: '/workspace/data-sync/.env' });

if (!process.env.DATABASE_URL) {
  console.error('❌ No se encontró DATABASE_URL');
  console.log('\nNecesitas configurar las variables de entorno primero.');
  console.log('Crea un archivo .env en /workspace/data-sync/ con:');
  console.log('DATABASE_URL=postgresql://...');
  console.log('BEDS24_API_KEY=...');
  console.log('BEDS24_PROP_KEY=...');
  process.exit(1);
}

console.log('🔌 Variables de entorno cargadas');
console.log(`   Database: ${process.env.DATABASE_URL?.includes('railway') ? 'Railway' : 'Local'}`);
console.log(`   Beds24 API: ${process.env.BEDS24_API_KEY ? '✓ Configurada' : '✗ Falta'}`);
console.log('');

// Ejecutar la sincronización
forceSyncBooking();