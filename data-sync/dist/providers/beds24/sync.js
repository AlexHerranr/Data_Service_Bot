import { getBeds24Client } from './client';
import { formatDateSimple, extractChargesAndPayments, extractInfoItems, calculateNights, determineBDStatus, shouldSyncAsLead, shouldSyncAsConfirmed, isCancelledBooking } from './utils';
import { prisma } from '../../infra/db/prisma.client';
import { logger } from '../../utils/logger';
export async function syncSingleBooking(bookingData) {
    try {
        const bookingId = bookingData.bookingId?.toString();
        if (!bookingId) {
            logger.warn({ bookingData }, 'Booking missing bookingId');
            return { success: false, action: 'skipped', table: 'Booking' };
        }
        const { charges, payments, totalCharges, totalPayments, balance } = extractChargesAndPayments(bookingData);
        const infoItems = extractInfoItems(bookingData);
        const numNights = calculateNights(bookingData.arrival, bookingData.departure);
        const bdStatus = determineBDStatus(bookingData);
        const commonData = {
            bookingId,
            phone: bookingData.phone || null,
            guestName: bookingData.guestFirstName && bookingData.guestName
                ? `${bookingData.guestFirstName} ${bookingData.guestName}`
                : (bookingData.guestName || null),
            status: bookingData.status || null,
            internalNotes: bookingData.notes || null,
            propertyName: bookingData.propertyName || null,
            arrivalDate: formatDateSimple(bookingData.arrival),
            departureDate: formatDateSimple(bookingData.departure),
            numNights,
            totalPersons: parseInt(bookingData.numAdult || '0') + parseInt(bookingData.numChild || '0') || null,
            totalCharges: totalCharges.toString(),
            totalPayments: totalPayments.toString(),
            balance: balance.toString(),
            basePrice: bookingData.price || null,
            channel: bookingData.referer || null,
            email: bookingData.guestEmail || null,
            apiReference: bookingData.apiReference || null,
            charges: charges,
            payments: payments,
            infoItems,
            notes: bookingData.comments || null,
            bookingDate: formatDateSimple(bookingData.created),
            modifiedDate: formatDateSimple(bookingData.modified),
            lastUpdatedBD: new Date(),
            raw: bookingData,
            BDStatus: bdStatus,
        };
        if (isCancelledBooking(bookingData)) {
            return await syncCancelledBooking(commonData);
        }
        else if (shouldSyncAsLead(bookingData) || shouldSyncAsConfirmed(bookingData)) {
            return await syncActiveBooking(commonData);
        }
        else {
            const existing = await prisma.reservas.findUnique({
                where: { bookingId }
            });
            const result = await prisma.reservas.upsert({
                where: { bookingId },
                create: commonData,
                update: {
                    ...commonData,
                    id: undefined,
                },
            });
            logger.debug({ bookingId, action: existing ? 'updated' : 'created' }, 'Synced booking to main table');
            return { success: true, action: existing ? 'updated' : 'created', table: 'Booking' };
        }
    }
    catch (error) {
        logger.error({ error: error.message, bookingId: bookingData.bookingId }, 'Failed to sync single booking');
        return { success: false, action: 'skipped', table: 'Booking' };
    }
}
async function syncCancelledBooking(bookingData) {
    try {
        const existing = await prisma.reservas.findUnique({
            where: { bookingId: bookingData.bookingId }
        });
        await prisma.reservas.upsert({
            where: { bookingId: bookingData.bookingId },
            create: {
                ...bookingData,
                cancelledAt: new Date(),
            },
            update: {
                ...bookingData,
                id: undefined,
                updatedAt: new Date(),
            },
        });
        logger.debug({ bookingId: bookingData.bookingId, action: existing ? 'updated' : 'created' }, 'Synced cancelled booking');
        return { success: true, action: existing ? 'updated' : 'created', table: 'ReservationsCancelled' };
    }
    catch (error) {
        logger.error({ error: error.message, bookingId: bookingData.bookingId }, 'Failed to sync cancelled booking');
        return { success: false, action: 'skipped', table: 'ReservationsCancelled' };
    }
}
async function syncActiveBooking(bookingData) {
    try {
        const existingBooking = await prisma.reservas.findUnique({
            where: { bookingId: bookingData.bookingId }
        });
        await prisma.reservas.upsert({
            where: { bookingId: bookingData.bookingId },
            create: bookingData,
            update: {
                ...bookingData,
                id: undefined,
            },
        });
        logger.debug({
            bookingId: bookingData.bookingId,
            bdStatus: bookingData.BDStatus,
            action: existingBooking ? 'updated' : 'created'
        }, 'Synced active booking');
        return { success: true, action: existingBooking ? 'updated' : 'created', table: 'Booking' };
    }
    catch (error) {
        logger.error({ error: error.message, bookingId: bookingData.bookingId }, 'Failed to sync active booking');
        return { success: false, action: 'skipped', table: 'Booking' };
    }
}
export async function syncCancelledReservations(fromDate, toDate) {
    const client = getBeds24Client();
    const result = { processed: 0, upserted: 0, skipped: 0, errors: 0 };
    try {
        logger.info({ fromDate, toDate }, 'Starting cancelled reservations sync');
        const defaultFromDate = fromDate || '2023-01-01';
        const defaultToDate = toDate || new Date().toISOString().split('T')[0];
        const bookings = await client.getCancelledBookings({
            arrivalFrom: defaultFromDate,
            arrivalTo: defaultToDate,
        });
        logger.info({ count: bookings.length }, 'Fetched cancelled bookings from Beds24');
        for (const booking of bookings) {
            result.processed++;
            const syncResult = await syncSingleBooking(booking);
            if (syncResult.success) {
                if (syncResult.action !== 'skipped') {
                    result.upserted++;
                }
                else {
                    result.skipped++;
                }
            }
            else {
                result.errors++;
            }
            if (result.processed % 100 === 0) {
                logger.info({ progress: result }, 'Sync progress update');
            }
        }
        logger.info({ result }, 'Completed cancelled reservations sync');
        return result;
    }
    catch (error) {
        logger.error({ error: error.message, result }, 'Failed to sync cancelled reservations');
        throw error;
    }
}
export async function syncLeadsAndConfirmed(fromDate, toDate) {
    const client = getBeds24Client();
    const result = { confirmed: 0, leads: 0, skipped: 0 };
    try {
        logger.info({ fromDate, toDate }, 'Starting leads and confirmed sync');
        const defaultFromDate = fromDate || new Date().toISOString().split('T')[0];
        const defaultToDate = toDate || new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const bookings = await client.getConfirmedBookings({
            arrivalFrom: defaultFromDate,
            arrivalTo: defaultToDate,
        });
        logger.info({ count: bookings.length }, 'Fetched confirmed bookings from Beds24');
        for (const booking of bookings) {
            const syncResult = await syncSingleBooking(booking);
            if (syncResult.success && syncResult.action !== 'skipped') {
                if (shouldSyncAsLead(booking)) {
                    result.leads++;
                }
                else if (shouldSyncAsConfirmed(booking)) {
                    result.confirmed++;
                }
            }
            else {
                result.skipped++;
            }
            if ((result.confirmed + result.leads + result.skipped) % 100 === 0) {
                logger.info({ progress: result }, 'Sync progress update');
            }
        }
        logger.info({ result }, 'Completed leads and confirmed sync');
        return result;
    }
    catch (error) {
        logger.error({ error: error.message, result }, 'Failed to sync leads and confirmed');
        throw error;
    }
}
export async function fullSync(options = {}) {
    logger.info({ options }, 'Starting full Beds24 sync');
    try {
        const cancelled = await syncCancelledReservations(options.cancelledFromDate, options.cancelledToDate);
        const active = await syncLeadsAndConfirmed(options.activeFromDate, options.activeToDate);
        const finalResult = { cancelled, active };
        logger.info({ result: finalResult }, 'Completed full Beds24 sync');
        return finalResult;
    }
    catch (error) {
        logger.error({ error: error.message }, 'Failed to complete full sync');
        throw error;
    }
}
export async function processWebhook(webhookData) {
    const errors = [];
    let processed = 0;
    try {
        logger.info({ webhookData }, 'Processing Beds24 webhook');
        if (webhookData.bookings && Array.isArray(webhookData.bookings)) {
            for (const booking of webhookData.bookings) {
                try {
                    await syncSingleBooking(booking);
                    processed++;
                }
                catch (error) {
                    errors.push(`Booking ${booking.bookingId}: ${error.message}`);
                }
            }
        }
        else if (webhookData.bookingId) {
            try {
                await syncSingleBooking(webhookData);
                processed++;
            }
            catch (error) {
                errors.push(`Booking ${webhookData.bookingId}: ${error.message}`);
            }
        }
        else {
            errors.push('Invalid webhook format: no booking data found');
        }
        logger.info({ processed, errors: errors.length }, 'Completed webhook processing');
        return {
            success: errors.length === 0,
            processed,
            errors
        };
    }
    catch (error) {
        logger.error({ error: error.message }, 'Failed to process webhook');
        return {
            success: false,
            processed,
            errors: [error.message]
        };
    }
}
