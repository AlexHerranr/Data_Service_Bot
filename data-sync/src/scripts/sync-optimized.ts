/**
 * Script OPTIMIZADO de sincronización para evitar rate limits
 * Descarga TODOS los datos en UNA sola llamada y luego procesa localmente
 */

import { getBeds24Client } from '../providers/beds24/client.js';
import { prisma } from '../infra/db/prisma.client.js';
import { logger } from '../utils/logger.js';
import { extractChargesAndPayments, extractGuestName, extractPhoneNumber, extractEmail, combineNotes, extractMessages } from '../providers/beds24/utils.js';
import { validateBookingData } from '../providers/beds24/validators.js';

interface SyncStats {
  totalFromBeds24: number;
  existingInDB: number;
  created: number;
  updated: number;
  errors: number;
  errorDetails: Array<{ bookingId: string; error: string }>;
}

/**
 * Transforma los datos de Beds24 al formato de la BD
 */
function transformBookingData(booking: any): any {
  try {
    const bookingId = String(booking.id);
    
    // Extraer datos usando las utilidades existentes
    const { charges, payments } = extractChargesAndPayments(booking);
    const guestName = extractGuestName(booking);
    const phone = extractPhoneNumber(booking);
    const email = extractEmail(booking);
    const notes = combineNotes(booking);
    const messages = extractMessages(booking);
    
    // Calcular totales
    const totalCharges = charges.reduce((sum: number, charge: any) => 
      sum + (parseFloat(charge.amount) || 0), 0);
    const totalPayments = payments.reduce((sum: number, payment: any) => 
      sum + (parseFloat(payment.amount) || 0), 0);
    const balance = totalCharges - totalPayments;
    
    // Construir objeto de datos
    const bookingData = {
      bookingId: bookingId,
      phone: phone,
      guestName: guestName,
      status: booking.status || 'unknown',
      internalNotes: booking.internalNotes || null,
      propertyName: booking.propId ? `Property ${booking.propId}` : null,
      arrivalDate: booking.arrival || null,
      departureDate: booking.departure || null,
      numNights: booking.numNights || null,
      totalPersons: (booking.numAdult || 0) + (booking.numChild || 0),
      totalCharges: totalCharges.toFixed(2),
      totalPayments: totalPayments.toFixed(2),
      balance: balance.toFixed(2),
      basePrice: booking.price ? String(booking.price) : null,
      channel: booking.channel || booking.apiSource || null,
      email: email,
      apiReference: booking.apiReference || null,
      charges: charges,
      payments: payments,
      messages: messages,
      infoItems: booking.infoItems || [],
      notes: notes,
      bookingDate: booking.bookingTime ? booking.bookingTime.split('T')[0] : null,
      modifiedDate: booking.modifiedTime ? booking.modifiedTime.split('T')[0] : null,
      raw: booking,
      BDStatus: booking.status
    };
    
    // Validar datos
    return validateBookingData(bookingData);
    
  } catch (error: any) {
    logger.error(`Error transformando booking ${booking.id}: ${error.message}`);
    throw error;
  }
}

/**
 * Ejecuta sincronización OPTIMIZADA
 */
export async function syncOptimized(): Promise<SyncStats> {
  const startTime = Date.now();
  const stats: SyncStats = {
    totalFromBeds24: 0,
    existingInDB: 0,
    created: 0,
    updated: 0,
    errors: 0,
    errorDetails: []
  };

  logger.info('🚀 INICIANDO SINCRONIZACIÓN OPTIMIZADA');
  logger.info('📅 Período: 1 Agosto 2025 - 1 Agosto 2026');
  logger.info('⚡ Estrategia: Descarga en batch + procesamiento local');
  logger.info('=' .repeat(60));

  try {
    // PASO 1: Obtener TODAS las reservas existentes en BD
    logger.info('📊 PASO 1: Analizando BD actual...');
    
    const existingBookings = await prisma.reservas.findMany({
      select: { 
        bookingId: true,
        modifiedDate: true
      }
    });
    
    const existingMap = new Map(
      existingBookings.map((b: any) => [b.bookingId, b.modifiedDate])
    );
    stats.existingInDB = existingMap.size;
    
    logger.info(`📊 Reservas actuales en BD: ${stats.existingInDB}`);

    // PASO 2: Descargar TODAS las reservas en UNA sola llamada
    logger.info('📥 PASO 2: Descargando TODAS las reservas de Beds24 (una sola llamada)...');
    
    const client = await getBeds24Client();
    
    // UNA SOLA LLAMADA para obtener TODO
    const allBookings = await client.getBookings({
      arrivalFrom: '2025-08-01',
      arrivalTo: '2026-08-01',
      status: ['confirmed', 'new', 'request', 'cancelled', 'black', 'inquiry'] as any,
      includeInvoiceItems: true,
      includeInfoItems: true,
      includeBookingGroup: false // No necesitamos esto, ahorra datos
    } as any);
    
    stats.totalFromBeds24 = allBookings.length;
    logger.info(`✅ Descargadas ${stats.totalFromBeds24} reservas en una sola llamada`);

    // PASO 3: Procesar localmente (sin más llamadas a la API)
    logger.info('💾 PASO 3: Procesando y guardando en BD...');
    
    const toCreate: any[] = [];
    const toUpdate: any[] = [];
    
    // Clasificar reservas
    for (const booking of allBookings) {
      const bookingId = String(booking.id);
      if (existingMap.has(bookingId)) {
        toUpdate.push(booking);
      } else {
        toCreate.push(booking);
      }
    }
    
    logger.info(`📊 Clasificación: ${toCreate.length} nuevas, ${toUpdate.length} a actualizar`);

    // PASO 4: Procesar nuevas reservas
    if (toCreate.length > 0) {
      logger.info(`🆕 Creando ${toCreate.length} reservas nuevas...`);
      
      for (let i = 0; i < toCreate.length; i++) {
        try {
          const booking = toCreate[i];
          const bookingData = transformBookingData(booking);
          
          await prisma.reservas.create({
            data: bookingData
          });
          
          stats.created++;
          
          if (i % 50 === 0) {
            logger.info(`  Progreso: ${i}/${toCreate.length} creadas`);
          }
        } catch (error: any) {
          stats.errors++;
          stats.errorDetails.push({
            bookingId: String(toCreate[i].id),
            error: error.message
          });
        }
      }
    }

    // PASO 5: Actualizar reservas existentes
    if (toUpdate.length > 0) {
      logger.info(`📝 Actualizando ${toUpdate.length} reservas existentes...`);
      
      for (let i = 0; i < toUpdate.length; i++) {
        try {
          const booking = toUpdate[i];
          const bookingId = String(booking.id);
          const bookingData = transformBookingData(booking);
          
          // Solo actualizar si cambió
          const existingModified = existingMap.get(bookingId);
          const newModified = booking.modifiedTime ? booking.modifiedTime.split('T')[0] : null;
          
          if (!existingModified || existingModified !== newModified) {
            await prisma.reservas.update({
              where: { bookingId },
              data: {
                ...bookingData,
                bookingId: undefined // No actualizar el ID
              }
            });
            
            stats.updated++;
          }
          
          if (i % 50 === 0) {
            logger.info(`  Progreso: ${i}/${toUpdate.length} procesadas`);
          }
        } catch (error: any) {
          stats.errors++;
          stats.errorDetails.push({
            bookingId: String(toUpdate[i].id),
            error: error.message
          });
        }
      }
    }

    // RESUMEN FINAL
    const duration = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    
    logger.info('=' .repeat(60));
    logger.info('✅ SINCRONIZACIÓN OPTIMIZADA COMPLETADA');
    logger.info('=' .repeat(60));
    logger.info('📊 RESUMEN:');
    logger.info(`  ⏱️  Duración: ${minutes}m ${seconds}s`);
    logger.info(`  📥 Total en Beds24: ${stats.totalFromBeds24}`);
    logger.info(`  📊 Existían en BD: ${stats.existingInDB}`);
    logger.info(`  ✅ Creadas: ${stats.created}`);
    logger.info(`  📝 Actualizadas: ${stats.updated}`);
    logger.info(`  ❌ Errores: ${stats.errors}`);
    logger.info(`  💰 Créditos API usados: ~1 (una sola llamada)`);
    
    if (stats.errors > 0) {
      logger.info('=' .repeat(60));
      logger.info('⚠️  RESERVAS CON ERROR:');
      stats.errorDetails.slice(0, 10).forEach(err => {
        logger.error(`  - ${err.bookingId}: ${err.error}`);
      });
      if (stats.errorDetails.length > 10) {
        logger.info(`  ... y ${stats.errorDetails.length - 10} errores más`);
      }
    }
    
    // Verificación final
    const finalCount = await prisma.reservas.count();
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
  logger.info('🚀 Ejecutando sincronización optimizada...');
  
  syncOptimized()
    .then(stats => {
      logger.info({ stats }, '✅ Proceso completado exitosamente');
      process.exit(0);
    })
    .catch(error => {
      logger.error('❌ Error fatal:', error);
      process.exit(1);
    });
}