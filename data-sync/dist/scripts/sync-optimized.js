import { getBeds24Client } from '../providers/beds24/client.js';
import { prisma } from '../infra/db/prisma.client.js';
import { logger } from '../utils/logger.js';
import { extractChargesAndPayments, extractGuestName, extractPhoneNumber, extractEmail, combineNotes, extractMessages } from '../providers/beds24/utils.js';
import { validateBookingData } from '../providers/beds24/validators.js';
function transformBookingData(booking) {
    try {
        const bookingId = String(booking.id);
        const { charges, payments } = extractChargesAndPayments(booking);
        const guestName = extractGuestName(booking);
        const phone = extractPhoneNumber(booking);
        const email = extractEmail(booking);
        const notes = combineNotes(booking);
        const messages = extractMessages(booking);
        const totalCharges = charges.reduce((sum, charge) => sum + (parseFloat(charge.amount) || 0), 0);
        const totalPayments = payments.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);
        const balance = totalCharges - totalPayments;
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
        return validateBookingData(bookingData);
    }
    catch (error) {
        logger.error(`Error transformando booking ${booking.id}: ${error.message}`);
        throw error;
    }
}
export async function syncOptimized() {
    const startTime = Date.now();
    const stats = {
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
    logger.info('='.repeat(60));
    try {
        logger.info('📊 PASO 1: Analizando BD actual...');
        const existingBookings = await prisma.booking.findMany({
            select: {
                bookingId: true,
                modifiedDate: true
            }
        });
        const existingMap = new Map(existingBookings.map(b => [b.bookingId, b.modifiedDate]));
        stats.existingInDB = existingMap.size;
        logger.info(`📊 Reservas actuales en BD: ${stats.existingInDB}`);
        logger.info('📥 PASO 2: Descargando TODAS las reservas de Beds24 (una sola llamada)...');
        const client = await getBeds24Client();
        const allBookings = await client.getBookings({
            arrivalFrom: '2025-08-01',
            arrivalTo: '2026-08-01',
            status: ['confirmed', 'new', 'request', 'cancelled', 'black', 'inquiry'],
            includeInvoiceItems: true,
            includeInfoItems: true,
            includeBookingGroup: false
        });
        stats.totalFromBeds24 = allBookings.length;
        logger.info(`✅ Descargadas ${stats.totalFromBeds24} reservas en una sola llamada`);
        logger.info('💾 PASO 3: Procesando y guardando en BD...');
        const toCreate = [];
        const toUpdate = [];
        for (const booking of allBookings) {
            const bookingId = String(booking.id);
            if (existingMap.has(bookingId)) {
                toUpdate.push(booking);
            }
            else {
                toCreate.push(booking);
            }
        }
        logger.info(`📊 Clasificación: ${toCreate.length} nuevas, ${toUpdate.length} a actualizar`);
        if (toCreate.length > 0) {
            logger.info(`🆕 Creando ${toCreate.length} reservas nuevas...`);
            for (let i = 0; i < toCreate.length; i++) {
                try {
                    const booking = toCreate[i];
                    const bookingData = transformBookingData(booking);
                    await prisma.booking.create({
                        data: bookingData
                    });
                    stats.created++;
                    if (i % 50 === 0) {
                        logger.info(`  Progreso: ${i}/${toCreate.length} creadas`);
                    }
                }
                catch (error) {
                    stats.errors++;
                    stats.errorDetails.push({
                        bookingId: String(toCreate[i].id),
                        error: error.message
                    });
                }
            }
        }
        if (toUpdate.length > 0) {
            logger.info(`📝 Actualizando ${toUpdate.length} reservas existentes...`);
            for (let i = 0; i < toUpdate.length; i++) {
                try {
                    const booking = toUpdate[i];
                    const bookingId = String(booking.id);
                    const bookingData = transformBookingData(booking);
                    const existingModified = existingMap.get(bookingId);
                    const newModified = booking.modifiedTime ? booking.modifiedTime.split('T')[0] : null;
                    if (!existingModified || existingModified !== newModified) {
                        await prisma.booking.update({
                            where: { bookingId },
                            data: {
                                ...bookingData,
                                bookingId: undefined
                            }
                        });
                        stats.updated++;
                    }
                    if (i % 50 === 0) {
                        logger.info(`  Progreso: ${i}/${toUpdate.length} procesadas`);
                    }
                }
                catch (error) {
                    stats.errors++;
                    stats.errorDetails.push({
                        bookingId: String(toUpdate[i].id),
                        error: error.message
                    });
                }
            }
        }
        const duration = Math.round((Date.now() - startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        logger.info('='.repeat(60));
        logger.info('✅ SINCRONIZACIÓN OPTIMIZADA COMPLETADA');
        logger.info('='.repeat(60));
        logger.info('📊 RESUMEN:');
        logger.info(`  ⏱️  Duración: ${minutes}m ${seconds}s`);
        logger.info(`  📥 Total en Beds24: ${stats.totalFromBeds24}`);
        logger.info(`  📊 Existían en BD: ${stats.existingInDB}`);
        logger.info(`  ✅ Creadas: ${stats.created}`);
        logger.info(`  📝 Actualizadas: ${stats.updated}`);
        logger.info(`  ❌ Errores: ${stats.errors}`);
        logger.info(`  💰 Créditos API usados: ~1 (una sola llamada)`);
        if (stats.errors > 0) {
            logger.info('='.repeat(60));
            logger.info('⚠️  RESERVAS CON ERROR:');
            stats.errorDetails.slice(0, 10).forEach(err => {
                logger.error(`  - ${err.bookingId}: ${err.error}`);
            });
            if (stats.errorDetails.length > 10) {
                logger.info(`  ... y ${stats.errorDetails.length - 10} errores más`);
            }
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
