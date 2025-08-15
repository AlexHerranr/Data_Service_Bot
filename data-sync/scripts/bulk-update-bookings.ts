#!/usr/bin/env tsx

/**
 * Script de Actualización Masiva de Bookings
 * 
 * Sincroniza todas las reservas desde agosto 2025 hasta diciembre 2026
 * usando el endpoint de Beds24 con filtros de fecha y paginación
 */

import { getBeds24Client } from '../src/providers/beds24/client.js';
import { syncSingleBooking } from '../src/providers/beds24/sync.js';
import { logger } from '../src/utils/logger.js';
import { connectPrisma } from '../src/infra/db/prisma.client.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface SyncStats {
  total: number;
  processed: number;
  updated: number;
  created: number;
  skipped: number;
  errors: number;
  startTime: Date;
}

const stats: SyncStats = {
  total: 0,
  processed: 0,
  updated: 0,
  created: 0,
  skipped: 0,
  errors: 0,
  startTime: new Date()
};

/**
 * Parsear argumentos CLI
 */
const argv = yargs(hideBin(process.argv))
  .option('from', {
    alias: 'f',
    description: 'Fecha inicio (YYYY-MM-DD)',
    type: 'string',
    default: '2025-08-01'
  })
  .option('to', {
    alias: 't', 
    description: 'Fecha fin (YYYY-MM-DD)',
    type: 'string',
    default: '2026-12-31'
  })
  .option('batch-size', {
    alias: 'b',
    description: 'Tamaño de lote por request',
    type: 'number',
    default: 100
  })
  .option('delay', {
    alias: 'd',
    description: 'Delay entre requests (ms)',
    type: 'number', 
    default: 1000
  })
  .option('dry-run', {
    description: 'Solo mostrar qué se haría, no ejecutar',
    type: 'boolean',
    default: false
  })
  .help()
  .parseSync();

/**
 * Delay helper para rate limiting
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Formatear fecha para API Beds24
 */
function formatDateForAPI(dateStr: string): string {
  return new Date(dateStr).toISOString();
}

/**
 * Obtener todas las reservas en rango de fechas con paginación
 */
async function fetchBookingsInRange(
  fromDate: string, 
  toDate: string,
  batchSize: number = 100
): Promise<any[]> {
  const client = getBeds24Client();
  let allBookings: any[] = [];
  let offset = 0;
  let hasMore = true;

  logger.info({
    fromDate,
    toDate,
    batchSize
  }, 'Starting bulk fetch from Beds24 API');

  while (hasMore) {
    try {
      logger.debug({ offset, batchSize }, 'Fetching batch from Beds24');

      // Usar parámetros múltiples para máxima cobertura
      const params = new URLSearchParams({
        // Reservas creadas en el rango
        bookingTimeFrom: formatDateForAPI(fromDate),
        bookingTimeTo: formatDateForAPI(toDate),
        // También incluir modificadas recientemente
        // modifiedFrom: formatDateForAPI('2025-08-12'), // Últimos 3 días
        // Paginación
        offset: offset.toString(),
        limit: batchSize.toString(),
        // Incluir datos completos
        includeInvoiceItems: 'true',
        includeInfoItems: 'true', 
        includeMessages: 'true'
      });

      const response = await client.makeRequest({
        method: 'GET',
        url: `/bookings?${params.toString()}`,
      });

      const bookings = response.data.data || [];
      
      if (bookings.length === 0) {
        hasMore = false;
        logger.info({ offset, total: allBookings.length }, 'No more bookings found');
      } else {
        allBookings.push(...bookings);
        offset += batchSize;
        
        logger.info({ 
          batchSize: bookings.length, 
          totalFetched: allBookings.length,
          offset 
        }, 'Batch fetched successfully');

        // Rate limiting entre requests
        await delay(argv.delay);
      }

    } catch (error: any) {
      logger.error({ 
        error: error.message, 
        offset, 
        batchSize 
      }, 'Error fetching batch from Beds24');
      
      // Continue with next batch on error
      offset += batchSize;
      await delay(argv.delay * 2); // Double delay on error
    }
  }

  return allBookings;
}

/**
 * Procesar un lote de reservas
 */
async function processBatch(bookings: any[]): Promise<void> {
  for (const booking of bookings) {
    try {
      const bookingId = booking.id?.toString();
      if (!bookingId) {
        stats.skipped++;
        logger.warn({ booking: booking.id }, 'Booking missing ID, skipping');
        continue;
      }

      logger.debug({ bookingId }, 'Processing booking');

      if (argv.dryRun) {
        logger.info({ 
          bookingId,
          status: booking.status,
          arrival: booking.arrival,
          guestName: booking.guestName || 'N/A'
        }, '[DRY-RUN] Would sync booking');
        stats.processed++;
        continue;
      }

      // Sync individual booking
      const result = await syncSingleBooking(bookingId);
      
      if (result.success) {
        if (result.action === 'created') {
          stats.created++;
        } else if (result.action === 'updated') {
          stats.updated++;
        } else {
          stats.skipped++;
        }
        stats.processed++;
        
        logger.debug({ 
          bookingId, 
          action: result.action,
          table: result.table 
        }, 'Booking synced successfully');
      } else {
        stats.errors++;
        logger.warn({ bookingId }, 'Booking sync failed');
      }

    } catch (error: any) {
      stats.errors++;
      logger.error({ 
        bookingId: booking.id,
        error: error.message 
      }, 'Error processing booking');
    }

    // Small delay between individual bookings
    await delay(100);
  }
}

/**
 * Mostrar progreso y estadísticas
 */
function showProgress(): void {
  const elapsed = Date.now() - stats.startTime.getTime();
  const rate = stats.processed / (elapsed / 1000);
  
  logger.info({
    total: stats.total,
    processed: stats.processed,
    created: stats.created,
    updated: stats.updated,
    skipped: stats.skipped,
    errors: stats.errors,
    progress: stats.total > 0 ? `${((stats.processed / stats.total) * 100).toFixed(1)}%` : '0%',
    rate: `${rate.toFixed(2)} bookings/sec`,
    elapsed: `${(elapsed / 1000).toFixed(0)}s`
  }, 'Sync progress update');
}

/**
 * Función principal
 */
async function main() {
  try {
    logger.info({
      fromDate: argv.from,
      toDate: argv.to,
      batchSize: argv.batchSize,
      delay: argv.delay,
      dryRun: argv.dryRun
    }, '🚀 Starting bulk booking sync');

    // Conectar a BD
    await connectPrisma();
    logger.info('📊 Connected to PostgreSQL');

    // 1. Fetch todas las reservas del rango
    logger.info('📥 Fetching bookings from Beds24...');
    const allBookings = await fetchBookingsInRange(
      argv.from,
      argv.to, 
      argv.batchSize
    );

    stats.total = allBookings.length;
    logger.info({ total: stats.total }, '📋 Total bookings fetched');

    if (stats.total === 0) {
      logger.warn('No bookings found in date range');
      return;
    }

    // 2. Procesar en lotes con rate limiting
    logger.info('🔄 Processing bookings...');
    const processingBatchSize = 10; // Procesar de a 10 para no sobrecargar
    
    for (let i = 0; i < allBookings.length; i += processingBatchSize) {
      const batch = allBookings.slice(i, i + processingBatchSize);
      
      await processBatch(batch);
      
      // Mostrar progreso cada 50 bookings
      if (stats.processed % 50 === 0) {
        showProgress();
      }
      
      // Rate limiting entre lotes
      await delay(argv.delay);
    }

    // 3. Estadísticas finales
    const totalElapsed = Date.now() - stats.startTime.getTime();
    const avgRate = stats.processed / (totalElapsed / 1000);
    
    logger.info({
      ...stats,
      totalElapsed: `${(totalElapsed / 1000).toFixed(0)}s`,
      avgRate: `${avgRate.toFixed(2)} bookings/sec`,
      successRate: `${((stats.processed - stats.errors) / stats.total * 100).toFixed(1)}%`
    }, '✅ Bulk sync completed');

    if (argv.dryRun) {
      logger.info('🔍 DRY-RUN completed - no changes made to database');
    }

  } catch (error: any) {
    logger.error({ 
      error: error.message,
      stack: error.stack 
    }, '❌ Bulk sync failed');
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Unhandled error:', error.message);
    process.exit(1);
  });
}

export { main };