#!/usr/bin/env node

/**
 * Script específico para sincronizar reservas
 * Desde: Agosto 1, 2025
 * Hasta: Agosto 31, 2026
 */

import { getBeds24Client } from './dist/providers/beds24/client.js';
import { processSingleBookingData } from './dist/providers/beds24/sync.js';
import { connectPrisma } from './dist/infra/db/prisma.client.js';
import { prisma } from './dist/infra/db/prisma.client.js';

// FECHAS ESPECÍFICAS
const FROM_DATE = '2025-08-01';  // 1 de Agosto 2025
const TO_DATE = '2026-08-31';    // 31 de Agosto 2026

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function syncAugustBookings() {
  const stats = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  };

  try {
    console.log(`
╔════════════════════════════════════════════════╗
║   SINCRONIZACIÓN: AGOSTO 2025 → AGOSTO 2026   ║
╚════════════════════════════════════════════════╝

📅 Periodo: ${FROM_DATE} hasta ${TO_DATE}
`);

    // Conectar
    await connectPrisma();
    console.log('✅ Base de datos conectada');
    
    const client = getBeds24Client();
    console.log('✅ Cliente Beds24 listo\n');

    // Obtener reservas del periodo
    console.log('📥 Obteniendo reservas...\n');
    
    try {
      const bookings = await client.getBookings({
        arrivalFrom: FROM_DATE,
        arrivalTo: TO_DATE,
        limit: 200  // Máximo 200 por si acaso
      });

      stats.total = bookings.length;
      console.log(`✅ Encontradas ${stats.total} reservas\n`);

      if (stats.total === 0) {
        console.log('No hay reservas en este periodo');
        return;
      }

      // Procesar cada reserva
      console.log('🔄 Procesando reservas...\n');
      
      for (let i = 0; i < bookings.length; i++) {
        const booking = bookings[i];
        const bookingId = booking.id;
        const guestName = booking.firstName || booking.lastName || 'Sin nombre';
        
        try {
          const result = await processSingleBookingData(booking);
          
          if (result.action === 'created') {
            stats.created++;
            console.log(`  ✅ CREADA: ${bookingId} - ${guestName}`);
          } else if (result.action === 'updated') {
            stats.updated++;
            console.log(`  📝 ACTUALIZADA: ${bookingId} - ${guestName}`);
          } else {
            stats.skipped++;
            console.log(`  ⏭️  OMITIDA: ${bookingId} - ${guestName}`);
          }
          
        } catch (error) {
          stats.errors++;
          console.log(`  ❌ ERROR: ${bookingId} - ${error.message}`);
        }

        // Mostrar progreso cada 10 reservas
        if ((i + 1) % 10 === 0) {
          console.log(`\n  📊 Progreso: ${i + 1}/${stats.total} (${Math.round((i + 1) / stats.total * 100)}%)\n`);
        }

        // Pequeña pausa cada 5 reservas para no sobrecargar
        if ((i + 1) % 5 === 0) {
          await delay(500);
        }
      }

    } catch (error) {
      if (error.response?.status === 429) {
        console.log(`
⚠️  LÍMITE DE API ALCANZADO (Error 429)
    
Por favor espera 6 minutos y vuelve a ejecutar el script.
El límite se resetea automáticamente.
`);
        return;
      }
      throw error;
    }

    // Estadísticas finales
    console.log(`
════════════════════════════════════════════════
✅ SINCRONIZACIÓN COMPLETADA
════════════════════════════════════════════════

📊 Resultados:
   Total de reservas:  ${stats.total}
   ✅ Creadas:         ${stats.created}
   📝 Actualizadas:    ${stats.updated}
   ⏭️  Omitidas:       ${stats.skipped}
   ❌ Errores:         ${stats.errors}
   
   Tasa de éxito: ${Math.round((stats.total - stats.errors) / stats.total * 100)}%
════════════════════════════════════════════════
`);

  } catch (error) {
    console.error('\n❌ Error fatal:', error.message);
    if (error.response?.data) {
      console.error('Detalles:', error.response.data);
    }
  } finally {
    await prisma.$disconnect();
    console.log('\n👋 Conexión cerrada');
  }
}

// Ejecutar
console.log('Iniciando sincronización...\n');
syncAugustBookings();