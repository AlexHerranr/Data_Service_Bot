/**
 * Script de sincronización COMPLETA para el período Agosto 2025 - Agosto 2026
 * 
 * OBJETIVO:
 * 1. Crear TODAS las reservas nuevas que no existen en BD
 * 2. Actualizar TODAS las reservas existentes (sin importar cuándo se modificaron)
 * 
 * Período fijo: 1 Agosto 2025 - 1 Agosto 2026
 */

import { getBeds24Client } from '../providers/beds24/client.js';
import { prisma } from '../infra/db/prisma.client.js';
import { logger } from '../utils/logger.js';
import { syncSingleBooking } from '../providers/beds24/sync.js';

interface SyncStats {
  totalFromBeds24: number;
  existingInDB: number;
  created: number;
  updated: number;
  errors: number;
  errorDetails: Array<{ bookingId: string; error: string }>;
}

/**
 * Ejecuta sincronización COMPLETA del período
 */
export async function syncCompletePeriod(): Promise<SyncStats> {
  const startTime = Date.now();
  const stats: SyncStats = {
    totalFromBeds24: 0,
    existingInDB: 0,
    created: 0,
    updated: 0,
    errors: 0,
    errorDetails: []
  };

  logger.info('🚀 INICIANDO SINCRONIZACIÓN COMPLETA');
  logger.info('📅 Período: 1 Agosto 2025 - 1 Agosto 2026');
  logger.info('=' .repeat(60));

  try {
    // PASO 1: Obtener TODAS las reservas existentes en BD
    logger.info('📊 PASO 1: Analizando BD actual...');
    
    const existingBookings = await prisma.booking.findMany({
      select: { 
        bookingId: true,
        guestName: true,
        arrivalDate: true,
        status: true
      }
    });
    
    const existingIds = new Set(existingBookings.map(b => b.bookingId));
    stats.existingInDB = existingIds.size;
    
    logger.info(`📊 Reservas actuales en BD: ${stats.existingInDB}`);

    // PASO 2: Obtener TODAS las reservas de Beds24 del período
    logger.info('📥 PASO 2: Descargando TODAS las reservas de Beds24...');
    
    const client = await getBeds24Client();
    
    // Obtener TODAS las reservas del período, TODOS los estados
    const allBookings = await client.getBookings({
      arrivalFrom: '2025-08-01',
      arrivalTo: '2026-08-01',
      // Incluir TODOS los estados posibles
      status: ['confirmed', 'new', 'request', 'cancelled', 'black', 'inquiry'] as any,
      includeInvoiceItems: true,
      includeInfoItems: true,
      includeBookingGroup: true
    } as any);
    
    stats.totalFromBeds24 = allBookings.length;
    logger.info(`✅ Obtenidas ${stats.totalFromBeds24} reservas de Beds24`);

    // PASO 3: Clasificar reservas
    const toCreate: any[] = [];
    const toUpdate: any[] = [];
    
    for (const booking of allBookings) {
      const bookingId = String(booking.id);
      if (existingIds.has(bookingId)) {
        toUpdate.push(booking);
      } else {
        toCreate.push(booking);
      }
    }
    
    logger.info('📊 CLASIFICACIÓN:');
    logger.info(`  🆕 Nuevas a crear: ${toCreate.length}`);
    logger.info(`  📝 Existentes a actualizar: ${toUpdate.length}`);
    logger.info('=' .repeat(60));

    // PASO 4: Crear todas las reservas NUEVAS
    if (toCreate.length > 0) {
      logger.info(`🆕 CREANDO ${toCreate.length} RESERVAS NUEVAS...`);
      
      const batchSize = 10;
      for (let i = 0; i < toCreate.length; i += batchSize) {
        const batch = toCreate.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(toCreate.length / batchSize);
        
        logger.info(`📦 Procesando lote ${batchNum}/${totalBatches} (${batch.length} reservas)`);
        
        for (const booking of batch) {
          try {
            const bookingId = String(booking.id);
            const result = await syncSingleBooking(bookingId);
            
            if (result.success && result.action === 'created') {
              stats.created++;
              logger.info(`✅ Creada: ${bookingId} - ${booking.firstName} ${booking.lastName} (${booking.arrival})`);
            } else if (result.success && result.action === 'updated') {
              // Puede pasar si se creó mientras procesábamos
              stats.updated++;
              logger.info(`📝 Actualizada (ya existía): ${bookingId}`);
            }
          } catch (error: any) {
            stats.errors++;
            stats.errorDetails.push({
              bookingId: String(booking.id),
              error: error.message
            });
            logger.error(`❌ Error creando ${booking.id}: ${error.message}`);
          }
        }
        
        // Pausa entre lotes para no sobrecargar
        if (i + batchSize < toCreate.length) {
          logger.debug('⏸️ Pausa de 2 segundos entre lotes...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    // PASO 5: Actualizar TODAS las reservas existentes
    if (toUpdate.length > 0) {
      logger.info('=' .repeat(60));
      logger.info(`📝 ACTUALIZANDO ${toUpdate.length} RESERVAS EXISTENTES...`);
      
      const batchSize = 15;
      for (let i = 0; i < toUpdate.length; i += batchSize) {
        const batch = toUpdate.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(toUpdate.length / batchSize);
        
        logger.info(`📦 Procesando lote ${batchNum}/${totalBatches} (${batch.length} reservas)`);
        
        for (const booking of batch) {
          try {
            const bookingId = String(booking.id);
            const result = await syncSingleBooking(bookingId);
            
            if (result.success && result.action === 'updated') {
              stats.updated++;
              logger.debug(`📝 Actualizada: ${bookingId} - ${booking.firstName} ${booking.lastName}`);
            } else if (result.success && result.action === 'created') {
              // Raro pero posible si se eliminó mientras procesábamos
              stats.created++;
              logger.info(`✅ Re-creada: ${bookingId}`);
            }
          } catch (error: any) {
            stats.errors++;
            stats.errorDetails.push({
              bookingId: String(booking.id),
              error: error.message
            });
            logger.error(`❌ Error actualizando ${booking.id}: ${error.message}`);
          }
        }
        
        // Pausa entre lotes
        if (i + batchSize < toUpdate.length) {
          logger.debug('⏸️ Pausa de 1 segundo entre lotes...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // RESUMEN FINAL
    const duration = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    
    logger.info('=' .repeat(60));
    logger.info('✅ SINCRONIZACIÓN COMPLETA FINALIZADA');
    logger.info('=' .repeat(60));
    logger.info('📊 RESUMEN:');
    logger.info(`  ⏱️  Duración: ${minutes}m ${seconds}s`);
    logger.info(`  📥 Total en Beds24: ${stats.totalFromBeds24}`);
    logger.info(`  📊 Existían en BD: ${stats.existingInDB}`);
    logger.info(`  ✅ Creadas: ${stats.created}`);
    logger.info(`  📝 Actualizadas: ${stats.updated}`);
    logger.info(`  ❌ Errores: ${stats.errors}`);
    
    if (stats.errors > 0) {
      logger.info('=' .repeat(60));
      logger.info('⚠️  RESERVAS CON ERROR:');
      stats.errorDetails.forEach(err => {
        logger.error(`  - ${err.bookingId}: ${err.error}`);
      });
    }
    
    // Verificación final
    const finalCount = await prisma.booking.count();
    logger.info('=' .repeat(60));
    logger.info(`📊 TOTAL FINAL EN BD: ${finalCount} reservas`);
    logger.info('=' .repeat(60));
    
    return stats;
    
  } catch (error: any) {
    logger.error(`❌ ERROR CRÍTICO: ${error.message}`);
    throw error;
  }
}

// Si se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info('🚀 Ejecutando sincronización completa del período...');
  
  syncCompletePeriod()
    .then(stats => {
      logger.info({ stats }, '✅ Proceso completado exitosamente');
      process.exit(0);
    })
    .catch(error => {
      logger.error('❌ Error fatal:', error);
      process.exit(1);
    });
}