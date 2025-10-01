import { getBeds24Client } from '../providers/beds24/client.js';
import { prisma } from '../infra/db/prisma.client.js';
import { logger } from '../utils/logger.js';
import { syncSingleBooking } from '../providers/beds24/sync.js';
async function getDatabaseStats() {
    logger.info('📊 FASE 0: Analizando estado actual de la BD...');
    const totalBookings = await prisma.reservas.count();
    const bookingIds = await prisma.reservas.findMany({
        select: { bookingId: true, modifiedDate: true },
        orderBy: { modifiedDate: 'desc' },
        take: 5
    });
    const lastModified = bookingIds[0]?.modifiedDate || 'never';
    const dateRange = await prisma.reservas.aggregate({
        _min: { arrivalDate: true },
        _max: { departureDate: true }
    });
    logger.info({
        totalBookings,
        lastModified,
        earliestArrival: dateRange._min.arrivalDate,
        latestDeparture: dateRange._max.departureDate,
        sampleIds: bookingIds.map((b) => b.bookingId)
    }, '📊 Estado actual de la BD');
    return {
        totalBookings,
        lastModified,
        existingIds: new Set(await prisma.reservas.findMany({
            select: { bookingId: true }
        }).then((books) => books.map((b) => b.bookingId)))
    };
}
async function syncNewBookings(existingIds) {
    logger.info('🆕 FASE 1: Buscando reservas NUEVAS que no están en BD...');
    const client = await getBeds24Client();
    const result = {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0
    };
    try {
        const bookings = await client.getBookings({
            arrivalFrom: '2025-08-01',
            arrivalTo: '2026-08-01',
            status: ['confirmed', 'new', 'request', 'cancelled', 'black', 'inquiry'],
            includeInvoiceItems: true,
            includeInfoItems: true,
            includeBookingGroup: true
        });
        logger.info(`📥 Obtenidas ${bookings.length} reservas de Beds24`);
        const newBookings = bookings.filter(b => !existingIds.has(String(b.id)));
        logger.info(`🔍 Encontradas ${newBookings.length} reservas NUEVAS para crear`);
        const batchSize = 10;
        for (let i = 0; i < newBookings.length; i += batchSize) {
            const batch = newBookings.slice(i, i + batchSize);
            logger.info(`📦 Procesando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(newBookings.length / batchSize)}`);
            for (const booking of batch) {
                try {
                    result.processed++;
                    const syncResult = await syncSingleBooking(String(booking.id));
                    if (syncResult.success) {
                        if (syncResult.action === 'created') {
                            result.created++;
                            logger.info(`✅ Creada: ${booking.id} - ${booking.firstName} ${booking.lastName}`);
                        }
                        else if (syncResult.action === 'updated') {
                            result.updated++;
                            logger.info(`📝 Actualizada: ${booking.id}`);
                        }
                    }
                    else {
                        result.skipped++;
                        logger.warn(`⏭️ Saltada: ${booking.id}`);
                    }
                }
                catch (error) {
                    result.errors++;
                    logger.error(`❌ Error en ${booking.id}: ${error.message}`);
                }
            }
            if (i + batchSize < newBookings.length) {
                logger.info('⏸️ Pausa de 2 segundos entre lotes...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    catch (error) {
        logger.error(`❌ Error en FASE 1: ${error.message}`);
    }
    return result;
}
async function syncModifiedBookings() {
    logger.info('🔄 FASE 2: Actualizando reservas MODIFICADAS recientemente...');
    const client = await getBeds24Client();
    const result = {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0
    };
    try {
        const lastSyncDate = new Date();
        lastSyncDate.setHours(lastSyncDate.getHours() - 48);
        logger.info(`📅 Buscando modificaciones desde: ${lastSyncDate.toISOString()}`);
        const bookings = await client.getBookings({
            modifiedFrom: lastSyncDate.toISOString(),
            arrivalFrom: '2025-08-01',
            arrivalTo: '2026-08-01',
            status: ['confirmed', 'new', 'request', 'cancelled'],
            includeInvoiceItems: true,
            includeInfoItems: true,
            includeBookingGroup: true
        });
        logger.info(`📥 Encontradas ${bookings.length} reservas modificadas`);
        for (const booking of bookings) {
            try {
                result.processed++;
                const syncResult = await syncSingleBooking(String(booking.id));
                if (syncResult.success) {
                    if (syncResult.action === 'updated') {
                        result.updated++;
                        logger.info(`📝 Actualizada: ${booking.id} - ${booking.firstName} ${booking.lastName}`);
                    }
                    else if (syncResult.action === 'created') {
                        result.created++;
                        logger.info(`✅ Creada (era nueva): ${booking.id}`);
                    }
                }
                else {
                    result.skipped++;
                }
            }
            catch (error) {
                result.errors++;
                logger.error(`❌ Error en ${booking.id}: ${error.message}`);
            }
        }
    }
    catch (error) {
        logger.error(`❌ Error en FASE 2: ${error.message}`);
    }
    return result;
}
async function syncUpcomingBookings() {
    logger.info('📅 FASE 3: Actualizando reservas con check-in en próximos 30 días...');
    const client = await getBeds24Client();
    const result = {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0
    };
    try {
        const today = new Date();
        const thirtyDaysLater = new Date();
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
        logger.info(`📅 Período: ${today.toISOString().split('T')[0]} a ${thirtyDaysLater.toISOString().split('T')[0]}`);
        const bookings = await client.getBookings({
            arrivalFrom: today.toISOString().split('T')[0],
            arrivalTo: thirtyDaysLater.toISOString().split('T')[0],
            status: ['confirmed', 'new', 'request'],
            includeInvoiceItems: true,
            includeInfoItems: true,
            includeBookingGroup: true
        });
        logger.info(`📥 Encontradas ${bookings.length} reservas próximas`);
        for (const booking of bookings) {
            try {
                result.processed++;
                const syncResult = await syncSingleBooking(String(booking.id));
                if (syncResult.success) {
                    if (syncResult.action === 'updated') {
                        result.updated++;
                        logger.debug(`📝 Actualizada próxima: ${booking.id}`);
                    }
                    else if (syncResult.action === 'created') {
                        result.created++;
                        logger.info(`✅ Creada próxima: ${booking.id}`);
                    }
                }
                else {
                    result.skipped++;
                }
            }
            catch (error) {
                result.errors++;
                logger.error(`❌ Error en ${booking.id}: ${error.message}`);
            }
        }
    }
    catch (error) {
        logger.error(`❌ Error en FASE 3: ${error.message}`);
    }
    return result;
}
async function syncCancelledBookings() {
    logger.info('❌ FASE 4: Verificando reservas CANCELADAS...');
    const client = await getBeds24Client();
    const result = {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0
    };
    try {
        const bookings = await client.getBookings({
            arrivalFrom: '2025-08-01',
            arrivalTo: '2026-08-01',
            status: ['cancelled'],
            includeInvoiceItems: true,
            includeInfoItems: true
        });
        logger.info(`📥 Encontradas ${bookings.length} reservas canceladas`);
        for (const booking of bookings) {
            try {
                result.processed++;
                const existing = await prisma.reservas.findUnique({
                    where: { bookingId: String(booking.id) },
                    select: { id: true, status: true }
                });
                if (existing && existing.status !== 'cancelled') {
                    const syncResult = await syncSingleBooking(String(booking.id));
                    if (syncResult.success) {
                        result.updated++;
                        logger.info(`❌ Marcada como cancelada: ${booking.id}`);
                    }
                }
                else if (!existing) {
                    const syncResult = await syncSingleBooking(String(booking.id));
                    if (syncResult.success) {
                        result.created++;
                        logger.info(`❌ Creada como cancelada: ${booking.id}`);
                    }
                }
                else {
                    result.skipped++;
                }
            }
            catch (error) {
                result.errors++;
                logger.error(`❌ Error en ${booking.id}: ${error.message}`);
            }
        }
    }
    catch (error) {
        logger.error(`❌ Error en FASE 4: ${error.message}`);
    }
    return result;
}
export async function executeSmartSync() {
    logger.info('🚀 INICIANDO SINCRONIZACIÓN INTELIGENTE DE RESERVAS');
    logger.info('📅 Período objetivo: 1 Ago 2025 - 1 Ago 2026');
    logger.info('='.repeat(60));
    const startTime = Date.now();
    const results = {};
    try {
        const dbStats = await getDatabaseStats();
        logger.info('\n' + '='.repeat(60));
        results.fase1 = await syncNewBookings(dbStats.existingIds);
        logger.info(`✅ FASE 1 completada: ${results.fase1.created} creadas, ${results.fase1.errors} errores`);
        logger.info('\n' + '='.repeat(60));
        results.fase2 = await syncModifiedBookings();
        logger.info(`✅ FASE 2 completada: ${results.fase2.updated} actualizadas, ${results.fase2.errors} errores`);
        logger.info('\n' + '='.repeat(60));
        results.fase3 = await syncUpcomingBookings();
        logger.info(`✅ FASE 3 completada: ${results.fase3.updated} actualizadas, ${results.fase3.errors} errores`);
        logger.info('\n' + '='.repeat(60));
        results.fase4 = await syncCancelledBookings();
        logger.info(`✅ FASE 4 completada: ${results.fase4.updated} actualizadas, ${results.fase4.errors} errores`);
        const totalProcessed = Object.values(results).reduce((sum, r) => sum + r.processed, 0);
        const totalCreated = Object.values(results).reduce((sum, r) => sum + r.created, 0);
        const totalUpdated = Object.values(results).reduce((sum, r) => sum + r.updated, 0);
        const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);
        const duration = Math.round((Date.now() - startTime) / 1000);
        logger.info('\n' + '='.repeat(60));
        logger.info('📊 RESUMEN FINAL DE SINCRONIZACIÓN');
        logger.info('='.repeat(60));
        logger.info(`⏱️ Duración total: ${duration} segundos`);
        logger.info(`📦 Total procesadas: ${totalProcessed}`);
        logger.info(`✅ Total creadas: ${totalCreated}`);
        logger.info(`📝 Total actualizadas: ${totalUpdated}`);
        logger.info(`❌ Total errores: ${totalErrors}`);
        logger.info('='.repeat(60));
        const finalCount = await prisma.reservas.count();
        logger.info(`📊 Total reservas en BD: ${finalCount}`);
        return {
            success: true,
            duration,
            results,
            summary: {
                totalProcessed,
                totalCreated,
                totalUpdated,
                totalErrors,
                finalBookingsInDB: finalCount
            }
        };
    }
    catch (error) {
        logger.error(`❌ Error crítico en sincronización: ${error.message}`);
        return {
            success: false,
            error: error.message,
            results
        };
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    executeSmartSync()
        .then(result => {
        logger.info({ result }, '✅ Sincronización completada');
        process.exit(0);
    })
        .catch(error => {
        logger.error('❌ Error fatal:', error);
        process.exit(1);
    });
}
