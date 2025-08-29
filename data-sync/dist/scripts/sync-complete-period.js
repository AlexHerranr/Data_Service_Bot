import { getBeds24Client } from '../providers/beds24/client.js';
import { prisma } from '../infra/db/prisma.client.js';
import { logger } from '../utils/logger.js';
import { syncSingleBooking } from '../providers/beds24/sync.js';
export async function syncCompletePeriod() {
    const startTime = Date.now();
    const stats = {
        totalFromBeds24: 0,
        existingInDB: 0,
        created: 0,
        updated: 0,
        errors: 0,
        errorDetails: []
    };
    logger.info('🚀 INICIANDO SINCRONIZACIÓN COMPLETA');
    logger.info('📅 Período: 1 Agosto 2025 - 1 Agosto 2026');
    logger.info('='.repeat(60));
    try {
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
        logger.info('📥 PASO 2: Descargando TODAS las reservas de Beds24...');
        const client = await getBeds24Client();
        const allBookings = await client.getBookings({
            arrivalFrom: '2025-08-01',
            arrivalTo: '2026-08-01',
            status: ['confirmed', 'new', 'request', 'cancelled', 'black', 'inquiry'],
            includeInvoiceItems: true,
            includeInfoItems: true,
            includeBookingGroup: true
        });
        stats.totalFromBeds24 = allBookings.length;
        logger.info(`✅ Obtenidas ${stats.totalFromBeds24} reservas de Beds24`);
        const toCreate = [];
        const toUpdate = [];
        for (const booking of allBookings) {
            const bookingId = String(booking.id);
            if (existingIds.has(bookingId)) {
                toUpdate.push(booking);
            }
            else {
                toCreate.push(booking);
            }
        }
        logger.info('📊 CLASIFICACIÓN:');
        logger.info(`  🆕 Nuevas a crear: ${toCreate.length}`);
        logger.info(`  📝 Existentes a actualizar: ${toUpdate.length}`);
        logger.info('='.repeat(60));
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
                        }
                        else if (result.success && result.action === 'updated') {
                            stats.updated++;
                            logger.info(`📝 Actualizada (ya existía): ${bookingId}`);
                        }
                    }
                    catch (error) {
                        stats.errors++;
                        stats.errorDetails.push({
                            bookingId: String(booking.id),
                            error: error.message
                        });
                        logger.error(`❌ Error creando ${booking.id}: ${error.message}`);
                    }
                }
                if (i + batchSize < toCreate.length) {
                    logger.debug('⏸️ Pausa de 2 segundos entre lotes...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        if (toUpdate.length > 0) {
            logger.info('='.repeat(60));
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
                        }
                        else if (result.success && result.action === 'created') {
                            stats.created++;
                            logger.info(`✅ Re-creada: ${bookingId}`);
                        }
                    }
                    catch (error) {
                        stats.errors++;
                        stats.errorDetails.push({
                            bookingId: String(booking.id),
                            error: error.message
                        });
                        logger.error(`❌ Error actualizando ${booking.id}: ${error.message}`);
                    }
                }
                if (i + batchSize < toUpdate.length) {
                    logger.debug('⏸️ Pausa de 1 segundo entre lotes...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        const duration = Math.round((Date.now() - startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        logger.info('='.repeat(60));
        logger.info('✅ SINCRONIZACIÓN COMPLETA FINALIZADA');
        logger.info('='.repeat(60));
        logger.info('📊 RESUMEN:');
        logger.info(`  ⏱️  Duración: ${minutes}m ${seconds}s`);
        logger.info(`  📥 Total en Beds24: ${stats.totalFromBeds24}`);
        logger.info(`  📊 Existían en BD: ${stats.existingInDB}`);
        logger.info(`  ✅ Creadas: ${stats.created}`);
        logger.info(`  📝 Actualizadas: ${stats.updated}`);
        logger.info(`  ❌ Errores: ${stats.errors}`);
        if (stats.errors > 0) {
            logger.info('='.repeat(60));
            logger.info('⚠️  RESERVAS CON ERROR:');
            stats.errorDetails.forEach(err => {
                logger.error(`  - ${err.bookingId}: ${err.error}`);
            });
        }
        const finalCount = await prisma.booking.count();
        logger.info('='.repeat(60));
        logger.info(`📊 TOTAL FINAL EN BD: ${finalCount} reservas`);
        logger.info('='.repeat(60));
        return stats;
    }
    catch (error) {
        logger.error(`❌ ERROR CRÍTICO: ${error.message}`);
        throw error;
    }
}
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
