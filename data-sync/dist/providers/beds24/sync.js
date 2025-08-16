import { getBeds24Client } from './client.js';
import { formatDateSimple, extractChargesAndPayments, extractInfoItems, calculateNights, determineBDStatus, shouldSyncAsLead, shouldSyncAsConfirmed, extractGuestName, extractPhoneNumber, extractEmail, combineNotes, calculateTotalPersons, determineChannel, extractMessages, mapPropertyName } from './utils.js';
import { prisma } from '../../infra/db/prisma.client.js';
import { logger } from '../../utils/logger.js';
export async function syncSingleBooking(bookingId) {
    try {
        if (String(bookingId).startsWith('999')) {
            logger.debug({ bookingId }, 'Skipping test booking');
            return { success: true, action: 'skipped', table: 'Booking' };
        }
        logger.info({ bookingId }, 'Starting sync for booking');
        const client = getBeds24Client();
        const bookingData = await client.getBooking(bookingId);
        if (!bookingData) {
            logger.warn({ bookingId }, 'Booking not found in Beds24');
            return { success: false, action: 'skipped', table: 'Booking' };
        }
        logger.debug({ bookingId, bookingData }, 'Fetched complete booking data from API');
        return await processSingleBookingData(bookingData);
    }
    catch (error) {
        logger.error({ error: error.message, bookingId }, 'Failed to sync single booking');
        return { success: false, action: 'skipped', table: 'Booking' };
    }
}
export async function processSingleBookingData(bookingData) {
    try {
        const bookingId = (bookingData.bookingId || bookingData.id)?.toString();
        if (!bookingId) {
            logger.warn({ bookingData }, 'Booking missing bookingId/id');
            return { success: false, action: 'skipped', table: 'Booking' };
        }
        const { charges, payments, totalCharges, totalPayments, balance } = extractChargesAndPayments(bookingData);
        const infoItems = extractInfoItems(bookingData);
        const numNights = calculateNights(bookingData.arrival, bookingData.departure);
        const bdStatus = determineBDStatus(bookingData);
        const guestName = extractGuestName(bookingData);
        const phone = extractPhoneNumber(bookingData);
        const email = extractEmail(bookingData);
        const commonData = {
            bookingId,
            phone: phone || 'unknown',
            guestName: guestName || 'Guest Unknown',
            status: bookingData.status || 'confirmed',
            internalNotes: combineNotes(bookingData),
            propertyName: mapPropertyName(bookingData.propertyId) || bookingData.propertyName || 'Unknown Property',
            arrivalDate: formatDateSimple(bookingData.arrival) || new Date().toISOString().split('T')[0],
            departureDate: formatDateSimple(bookingData.departure) || new Date().toISOString().split('T')[0],
            numNights,
            totalPersons: calculateTotalPersons(bookingData),
            totalCharges: totalCharges.toString(),
            totalPayments: totalPayments.toString(),
            balance: balance.toString(),
            basePrice: bookingData.price != null ? String(bookingData.price) : null,
            channel: determineChannel(bookingData) || 'unknown',
            email: email || 'unknown',
            apiReference: bookingData.apiReference || null,
            charges: charges,
            payments: payments,
            messages: extractMessages(bookingData),
            infoItems,
            notes: bookingData.comments || 'no notes',
            bookingDate: formatDateSimple(bookingData.created || bookingData.bookingTime),
            modifiedDate: formatDateSimple(bookingData.modified || bookingData.modifiedTime),
            lastUpdatedBD: new Date(),
            raw: bookingData,
            BDStatus: bdStatus || 'Confirmed',
        };
        if (bookingData.action === 'MODIFY' || bookingData.action === 'modified') {
            commonData.messages = extractMessages(bookingData);
            logger.debug({ bookingId, messageCount: commonData.messages?.length || 0 }, 'Enhanced message extraction for MODIFY action');
        }
        const existing = await prisma.booking.findUnique({
            where: { bookingId }
        });
        const result = await prisma.booking.upsert({
            where: { bookingId },
            create: commonData,
            update: {
                ...commonData,
                id: undefined,
            },
        });
        logger.info({
            bookingId,
            action: existing ? 'updated' : 'created',
            table: 'Booking',
            resultId: result.id,
            guestName: result.guestName,
            phone: result.phone,
            status: result.status,
            bdStatus: result.BDStatus
        }, '✅ Successfully synced to BD - Booking table');
        return { success: true, action: existing ? 'updated' : 'created', table: 'Booking' };
    }
    catch (error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            bookingId: bookingData.bookingId || bookingData.id,
            data: bookingData,
            constraint: error.code === 'P2002' ? 'unique_constraint' : error.code
        }, '❌ Failed to sync to BD - check constraints and data');
        return { success: false, action: 'skipped', table: 'Booking' };
    }
}
async function syncCancelledBooking(bookingData) {
    try {
        const existing = await prisma.booking.findUnique({
            where: { bookingId: bookingData.bookingId }
        });
        await prisma.booking.upsert({
            where: { bookingId: bookingData.bookingId },
            create: {
                ...bookingData,
                status: 'cancelled',
            },
            update: {
                ...bookingData,
                id: undefined,
                status: 'cancelled',
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
        const existingBooking = await prisma.booking.findUnique({
            where: { bookingId: bookingData.bookingId }
        });
        const activeResult = await prisma.booking.upsert({
            where: { bookingId: bookingData.bookingId },
            create: bookingData,
            update: {
                ...bookingData,
                id: undefined,
            },
        });
        logger.info({
            bookingId: bookingData.bookingId,
            bdStatus: bookingData.BDStatus,
            action: existingBooking ? 'updated' : 'created',
            resultId: activeResult.id,
            table: 'Booking'
        }, '✅ Successfully synced active booking to BD');
        return { success: true, action: existingBooking ? 'updated' : 'created', table: 'Booking' };
    }
    catch (error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            bookingId: bookingData.bookingId,
            bdStatus: bookingData.BDStatus,
            constraint: error.code === 'P2002' ? 'unique_constraint' : error.code
        }, '❌ Failed to sync active booking to BD');
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
            const syncResult = await processSingleBookingData(booking);
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
            const syncResult = await processSingleBookingData(booking);
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
                    await processSingleBookingData(booking);
                    processed++;
                }
                catch (error) {
                    errors.push(`Booking ${booking.bookingId}: ${error.message}`);
                }
            }
        }
        else if (webhookData.bookingId) {
            try {
                await processSingleBookingData(webhookData);
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
