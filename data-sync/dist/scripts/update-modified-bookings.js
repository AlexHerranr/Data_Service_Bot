import { getBeds24Client } from '../providers/beds24/client.js';
import { prisma } from '../infra/db/prisma.client.js';
import { logger } from '../utils/logger.js';
import { syncSingleBooking } from '../providers/beds24/sync.js';
export async function updateModifiedBookings(options = {}) {
    const { hoursBack = 24, onlyConfirmed = false, batchSize = 20 } = options;
    logger.info('🔄 ACTUALIZACIÓN RÁPIDA DE RESERVAS MODIFICADAS');
    logger.info(`⏰ Buscando cambios de últimas ${hoursBack} horas`);
    const startTime = Date.now();
    const stats = {
        checked: 0,
        updated: 0,
        created: 0,
        skipped: 0,
        errors: 0
    };
    try {
        const client = await getBeds24Client();
        const modifiedFrom = new Date();
        modifiedFrom.setHours(modifiedFrom.getHours() - hoursBack);
        logger.info(`📅 Desde: ${modifiedFrom.toISOString()}`);
        const statusFilter = onlyConfirmed
            ? ['confirmed', 'new']
            : ['confirmed', 'new', 'request', 'cancelled', 'black', 'inquiry'];
        const bookings = await client.getBookings({
            modifiedFrom: modifiedFrom.toISOString(),
            arrivalFrom: '2025-08-01',
            arrivalTo: '2026-08-01',
            status: statusFilter,
            includeInvoiceItems: true,
            includeInfoItems: true,
            includeBookingGroup: true
        });
        logger.info(`📥 Encontradas ${bookings.length} reservas modificadas`);
        if (bookings.length === 0) {
            logger.info('✅ No hay reservas para actualizar');
            return stats;
        }
        for (let i = 0; i < bookings.length; i += batchSize) {
            const batch = bookings.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(bookings.length / batchSize);
            logger.info(`📦 Procesando lote ${batchNum}/${totalBatches}`);
            const promises = batch.map(async (booking) => {
                try {
                    stats.checked++;
                    const existing = await prisma.booking.findUnique({
                        where: { bookingId: String(booking.id) },
                        select: {
                            id: true,
                            modifiedDate: true,
                            status: true
                        }
                    });
                    const bookingModified = new Date(booking.modifiedTime || booking.bookingTime);
                    const dbModified = existing?.modifiedDate ? new Date(existing.modifiedDate) : null;
                    if (!existing || !dbModified || bookingModified > dbModified) {
                        const syncResult = await syncSingleBooking(String(booking.id));
                        if (syncResult.success) {
                            if (syncResult.action === 'created') {
                                stats.created++;
                                logger.info(`✅ Nueva: ${booking.id} - ${booking.firstName} ${booking.lastName}`);
                            }
                            else if (syncResult.action === 'updated') {
                                stats.updated++;
                                logger.debug(`📝 Actualizada: ${booking.id} - ${booking.firstName} ${booking.lastName}`);
                            }
                        }
                        else {
                            stats.skipped++;
                        }
                    }
                    else {
                        stats.skipped++;
                        logger.debug(`⏭️ Sin cambios: ${booking.id}`);
                    }
                }
                catch (error) {
                    stats.errors++;
                    logger.error(`❌ Error en ${booking.id}: ${error.message}`);
                }
            });
            await Promise.all(promises);
            if (i + batchSize < bookings.length) {
                logger.debug('⏸️ Pausa de 1 segundo entre lotes...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        const duration = Math.round((Date.now() - startTime) / 1000);
        logger.info('='.repeat(50));
        logger.info('📊 RESUMEN DE ACTUALIZACIÓN');
        logger.info(`⏱️ Duración: ${duration} segundos`);
        logger.info(`🔍 Verificadas: ${stats.checked}`);
        logger.info(`✅ Creadas: ${stats.created}`);
        logger.info(`📝 Actualizadas: ${stats.updated}`);
        logger.info(`⏭️ Sin cambios: ${stats.skipped}`);
        logger.info(`❌ Errores: ${stats.errors}`);
        logger.info('='.repeat(50));
        return stats;
    }
    catch (error) {
        logger.error(`❌ Error crítico: ${error.message}`);
        throw error;
    }
}
export async function quickUpdate() {
    return updateModifiedBookings({
        hoursBack: 2,
        onlyConfirmed: true,
        batchSize: 10
    });
}
if (import.meta.url === `file://${process.argv[1]}`) {
    const hoursBack = parseInt(process.argv[2]) || 24;
    updateModifiedBookings({ hoursBack })
        .then(stats => {
        logger.info({ stats }, '✅ Actualización completada');
        process.exit(0);
    })
        .catch(error => {
        logger.error('❌ Error:', error);
        process.exit(1);
    });
}
