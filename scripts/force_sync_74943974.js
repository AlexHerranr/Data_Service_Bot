#!/usr/bin/env node

/**
 * Script para forzar la sincronización de la reserva 74943974
 * Este script:
 * 1. Verifica si la reserva existe en la BD
 * 2. Si no existe, la obtiene de Beds24 y la crea
 * 3. Si existe, la actualiza con los datos más recientes
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../data-sync/.env') });

async function forceSync() {
  console.log('=' .repeat(70));
  console.log('🔄 FORZANDO SINCRONIZACIÓN DE RESERVA 74943974');
  console.log('=' .repeat(70));
  console.log('');

  try {
    // Importar las funciones necesarias después de cargar el .env
    const { PrismaClient } = require('@prisma/client');
    const { syncSingleBooking } = require('../data-sync/dist/providers/beds24/sync.js');
    
    const prisma = new PrismaClient();
    const bookingId = '74943974';
    
    // PASO 1: Verificar si existe en la BD
    console.log('📊 PASO 1: Verificando si la reserva existe en la BD...');
    const existingBooking = await prisma.booking.findUnique({
      where: { bookingId: bookingId }
    });
    
    if (existingBooking) {
      console.log('✅ La reserva YA EXISTE en la BD:');
      console.log(`   - ID en BD: ${existingBooking.id}`);
      console.log(`   - Nombre: ${existingBooking.guestName}`);
      console.log(`   - Estado: ${existingBooking.status}`);
      console.log(`   - Propiedad: ${existingBooking.propertyName}`);
      console.log(`   - Llegada: ${existingBooking.arrivalDate}`);
      console.log(`   - Salida: ${existingBooking.departureDate}`);
      console.log(`   - Última actualización: ${existingBooking.lastUpdatedBD}`);
      console.log('');
      console.log('🔄 Actualizando con datos más recientes de Beds24...');
    } else {
      console.log('❌ La reserva NO EXISTE en la BD');
      console.log('📥 Creando nueva reserva desde Beds24...');
    }
    console.log('');
    
    // PASO 2: Sincronizar (crear o actualizar)
    console.log('📡 PASO 2: Obteniendo datos de Beds24 y sincronizando...');
    console.log('   Esto hará un UPSERT (crear si no existe, actualizar si existe)');
    console.log('');
    
    const result = await syncSingleBooking(bookingId);
    
    console.log('📋 RESULTADO DE LA SINCRONIZACIÓN:');
    console.log('=' .repeat(50));
    console.log(`   Success: ${result.success ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   Action: ${result.action} (created = nueva, updated = actualizada)`);
    console.log(`   Table: ${result.table}`);
    console.log('=' .repeat(50));
    console.log('');
    
    if (result.success) {
      // PASO 3: Verificar el resultado final
      console.log('🔍 PASO 3: Verificando el resultado en la BD...');
      const finalBooking = await prisma.booking.findUnique({
        where: { bookingId: bookingId },
        select: {
          id: true,
          bookingId: true,
          guestName: true,
          status: true,
          propertyName: true,
          arrivalDate: true,
          departureDate: true,
          totalCharges: true,
          totalPayments: true,
          balance: true,
          lastUpdatedBD: true,
          BDStatus: true,
          charges: true
        }
      });
      
      if (finalBooking) {
        console.log('✅ RESERVA CONFIRMADA EN LA BD:');
        console.log('=' .repeat(50));
        console.log(`   ID en BD: ${finalBooking.id}`);
        console.log(`   Booking ID: ${finalBooking.bookingId}`);
        console.log(`   Nombre: ${finalBooking.guestName}`);
        console.log(`   Estado: ${finalBooking.status}`);
        console.log(`   BD Status: ${finalBooking.BDStatus}`);
        console.log(`   Propiedad: ${finalBooking.propertyName}`);
        console.log(`   Llegada: ${finalBooking.arrivalDate}`);
        console.log(`   Salida: ${finalBooking.departureDate}`);
        console.log(`   Total Cargos: ${finalBooking.totalCharges}`);
        console.log(`   Total Pagos: ${finalBooking.totalPayments}`);
        console.log(`   Balance: ${finalBooking.balance}`);
        console.log(`   Última actualización: ${finalBooking.lastUpdatedBD}`);
        
        if (finalBooking.charges && Array.isArray(finalBooking.charges)) {
          console.log('');
          console.log('   CARGOS:');
          finalBooking.charges.forEach(charge => {
            console.log(`     • ${charge.description}: $${charge.amount}`);
          });
        }
        console.log('=' .repeat(50));
        
        // Verificar si fue creada o actualizada
        const wasCreated = !existingBooking;
        if (wasCreated) {
          console.log('');
          console.log('🎉 ¡ÉXITO! La reserva fue CREADA en la BD');
        } else {
          console.log('');
          console.log('🎉 ¡ÉXITO! La reserva fue ACTUALIZADA en la BD');
        }
      }
    } else {
      console.log('❌ ERROR: La sincronización falló');
      console.log('   Posibles causas:');
      console.log('   1. La reserva no existe en Beds24');
      console.log('   2. Error de conexión con la API de Beds24');
      console.log('   3. Datos inválidos o incompletos');
      console.log('');
      console.log('   Revisa los logs del servicio para más detalles');
    }
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR CRÍTICO:', error.message);
    console.error('');
    console.error('Detalles del error:');
    console.error(error.stack);
    console.error('');
    console.error('Verifica:');
    console.error('1. Que el servicio data-sync esté compilado (npm run build)');
    console.error('2. Que las variables de entorno estén configuradas');
    console.error('3. Que tengas conexión a la BD y a Beds24');
    process.exit(1);
  }
}

// Verificar configuración antes de ejecutar
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: No se encontró DATABASE_URL');
  console.error('');
  console.error('Crea un archivo .env en /workspace/data-sync/ con:');
  console.error('DATABASE_URL=postgresql://...');
  console.error('BEDS24_API_KEY=...');
  console.error('BEDS24_PROP_KEY=...');
  process.exit(1);
}

if (!process.env.BEDS24_API_KEY || !process.env.BEDS24_PROP_KEY) {
  console.error('⚠️  ADVERTENCIA: No se encontraron las credenciales de Beds24');
  console.error('   El script puede fallar al intentar obtener datos de la API');
  console.error('');
}

console.log('🔌 Configuración detectada:');
console.log(`   Database: ${process.env.DATABASE_URL?.includes('railway') ? 'Railway PostgreSQL' : 'Local'}`);
console.log(`   Beds24 API Key: ${process.env.BEDS24_API_KEY ? '✓ Configurada' : '✗ Falta'}`);
console.log(`   Beds24 Prop Key: ${process.env.BEDS24_PROP_KEY ? '✓ Configurada' : '✗ Falta'}`);
console.log('');

// Ejecutar la sincronización
forceSync().catch(console.error);