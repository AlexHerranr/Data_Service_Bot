import { getBeds24Client } from '../providers/beds24/client.js';
import { prisma } from '../infra/db/prisma.client.js';
import { logger } from '../utils/logger.js';
import { extractChargesAndPayments, extractGuestName, extractPhoneNumber, extractEmail, combineNotes, extractMessages } from '../providers/beds24/utils.js';
import { validateBookingData } from '../providers/beds24/validators.js';
async function waitWithCountdown(minutes) {
    const totalSeconds = minutes * 60;
    logger.info(`⏳ Esperando ${minutes} minutos para que se reinicie el límite de créditos...`);
    for (let i = totalSeconds; i > 0; i--) {
        if (i % 60 === 0) {
            const minutesLeft = i / 60;
            logger.info(`⏰ Quedan ${minutesLeft} minutos...`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    logger.info('✅ Tiempo de espera completado, continuando...');
}
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
async function getBookingsWithRateLimit(client, params) {
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
        try {
            attempts++;
            logger.info(`📥 Intento ${attempts}: Descargando reservas de Beds24...`);
            const bookings = await client.getBookings(params);
            logger.info(`✅ Descargadas ${bookings.length} reservas exitosamente`);
            return bookings;
        }
        catch (error) {
            if (error.response?.status === 429 || error.message?.includes('429')) {
                logger.warn(`⚠️ Rate limit alcanzado (429) en intento ${attempts}`);
                if (attempts < maxAttempts) {
                    await waitWithCountdown(6);
                }
                else {
                    throw new Error('Se alcanzó el máximo de intentos con rate limit');
                }
            }
            else {
                throw error;
            }
        }
    }
    return [];
}
export async function syncWithRateLimit() {
    const startTime = Date.now();
    const stats = {
        totalFromBeds24: 0,
        existingInDB: 0,
        created: 0,
        updated: 0,
        errors: 0,
        rateLimitWaits: 0,
        errorDetails: []
    };
    logger.info('🚀 INICIANDO SINCRONIZACIÓN CON MANEJO DE RATE LIMITS');
    logger.info('📅 Período: 1 Agosto 2025 - 1 Agosto 2026');
    logger.info('⚡ Estrategia: Reintentos automáticos con espera de 6 minutos');
    logger.info('='.repeat(60));
    try {
        logger.info('📊 PASO 1: Analizando BD actual...');
        const existingBookings = await prisma.reservas.findMany({
            select: {
                bookingId: true,
                modifiedDate: true
            }
        });
        const existingMap = new Map(existingBookings.map((b) => [b.bookingId, b.modifiedDate]));
        stats.existingInDB = existingMap.size;
        logger.info(`📊 Reservas actuales en BD: ${stats.existingInDB}`);
        logger.info('📥 PASO 2: Descargando reservas de Beds24...');
        const client = await getBeds24Client();
        const params = {
            arrivalFrom: '2025-08-01',
            arrivalTo: '2026-08-01',
            status: ['confirmed', 'new', 'request', 'cancelled', 'black', 'inquiry'],
            includeInvoiceItems: true,
            includeInfoItems: true,
            includeBookingGroup: false
        };
        const allBookings = await getBookingsWithRateLimit(client, params);
        stats.totalFromBeds24 = allBookings.length;
        logger.info(`✅ Total de reservas obtenidas: ${stats.totalFromBeds24}`);
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
        logger.info('📊 CLASIFICACIÓN:');
        logger.info(`  🆕 Nuevas a crear: ${toCreate.length}`);
        logger.info(`  📝 Existentes a actualizar: ${toUpdate.length}`);
        logger.info('='.repeat(60));
        if (toCreate.length > 0) {
            logger.info(`🆕 CREANDO ${toCreate.length} RESERVAS NUEVAS...`);
            let progressCounter = 0;
            for (const booking of toCreate) {
                try {
                    const bookingData = transformBookingData(booking);
                    await prisma.reservas.create({
                        data: bookingData
                    });
                    stats.created++;
                    progressCounter++;
                    if (progressCounter % 25 === 0) {
                        logger.info(`  ✅ Progreso: ${progressCounter}/${toCreate.length} creadas`);
                    }
                }
                catch (error) {
                    stats.errors++;
                    stats.errorDetails.push({
                        bookingId: String(booking.id),
                        error: error.message
                    });
                    logger.error(`  ❌ Error creando ${booking.id}: ${error.message}`);
                }
            }
            logger.info(`  ✅ Completado: ${stats.created} reservas creadas`);
        }
        if (toUpdate.length > 0) {
            logger.info(`📝 ACTUALIZANDO ${toUpdate.length} RESERVAS EXISTENTES...`);
            let progressCounter = 0;
            for (const booking of toUpdate) {
                try {
                    const bookingId = String(booking.id);
                    const bookingData = transformBookingData(booking);
                    const existingModified = existingMap.get(bookingId);
                    const newModified = booking.modifiedTime ? booking.modifiedTime.split('T')[0] : null;
                    if (!existingModified || existingModified !== newModified) {
                        await prisma.reservas.update({
                            where: { bookingId },
                            data: {
                                ...bookingData,
                                bookingId: undefined
                            }
                        });
                        stats.updated++;
                    }
                    progressCounter++;
                    if (progressCounter % 25 === 0) {
                        logger.info(`  📝 Progreso: ${progressCounter}/${toUpdate.length} procesadas`);
                    }
                }
                catch (error) {
                    stats.errors++;
                    stats.errorDetails.push({
                        bookingId: String(booking.id),
                        error: error.message
                    });
                    logger.error(`  ❌ Error actualizando ${booking.id}: ${error.message}`);
                }
            }
            logger.info(`  ✅ Completado: ${stats.updated} reservas actualizadas`);
        }
        const duration = Math.round((Date.now() - startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        logger.info('='.repeat(60));
        logger.info('✅ SINCRONIZACIÓN COMPLETADA EXITOSAMENTE');
        logger.info('='.repeat(60));
        logger.info('📊 RESUMEN FINAL:');
        logger.info(`  ⏱️  Duración total: ${minutes}m ${seconds}s`);
        logger.info(`  📥 Total en Beds24: ${stats.totalFromBeds24}`);
        logger.info(`  📊 Existían en BD: ${stats.existingInDB}`);
        logger.info(`  ✅ Creadas: ${stats.created}`);
        logger.info(`  📝 Actualizadas: ${stats.updated}`);
        logger.info(`  ❌ Errores: ${stats.errors}`);
        logger.info(`  ⏳ Esperas por rate limit: ${stats.rateLimitWaits}`);
        if (stats.errors > 0 && stats.errorDetails.length > 0) {
            logger.info('='.repeat(60));
            logger.info('⚠️  PRIMEROS 10 ERRORES:');
            stats.errorDetails.slice(0, 10).forEach(err => {
                logger.error(`  - ${err.bookingId}: ${err.error}`);
            });
            if (stats.errorDetails.length > 10) {
                logger.info(`  ... y ${stats.errorDetails.length - 10} errores más`);
            }
        }
        const finalCount = await prisma.reservas.count();
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
    logger.info('🚀 Iniciando sincronización con manejo de rate limits...');
    syncWithRateLimit()
        .then(stats => {
        logger.info({ stats }, '✅ Proceso completado exitosamente');
        process.exit(0);
    })
        .catch(error => {
        logger.error('❌ Error fatal:', error);
        process.exit(1);
    });
}
