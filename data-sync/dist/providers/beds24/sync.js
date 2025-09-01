import { getBeds24Client } from './client.js';
import { formatDateSimple, extractChargesAndPayments, extractInfoItems, calculateNights, determineBDStatus, shouldSyncAsLead, shouldSyncAsConfirmed, extractGuestName, extractPhoneNumber, extractEmail, combineNotes, calculateTotalPersons, determineChannel, mapPropertyName } from './utils.js';
import { validateBookingData, isValidBooking } from './validators.js';
import { mergeMessages, extractMessagesFromPayload } from './message-handler.js';
import { prisma } from '../../infra/db/prisma.client.js';
import { logger } from '../../utils/logger.js';
export async function syncSingleBooking(bookingId) {
    try {
        logger.info({ bookingId }, '🔍 SYNC STEP A: syncSingleBooking started');
        if (String(bookingId).startsWith('999')) {
            logger.debug({ bookingId }, '🧪 SYNC STEP A.1: Skipping test booking');
            return { success: true, action: 'skipped', table: 'Booking' };
        }
        logger.info({ bookingId }, '🚀 SYNC STEP B: Starting sync for booking');
        logger.info({ bookingId }, '🌐 SYNC STEP C: Getting Beds24 client');
        const client = getBeds24Client();
        logger.info({ bookingId }, '📡 SYNC STEP D: Fetching booking from Beds24 API');
        const bookingData = await client.getBooking(bookingId);
        if (!bookingData) {
            logger.warn({ bookingId }, '⚠️ SYNC STEP D.1: Booking not found in Beds24');
            return { success: false, action: 'skipped', table: 'Booking' };
        }
        logger.info({ bookingId, hasData: !!bookingData }, '✅ SYNC STEP E: Fetched complete booking data from API');
        logger.info({ bookingId }, '⚙️ SYNC STEP F: Starting processSingleBookingData');
        return await processSingleBookingData(bookingData);
    }
    catch (error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            bookingId
        }, '💥 SYNC ERROR: Failed to sync single booking');
        return { success: false, action: 'skipped', table: 'Booking' };
    }
}
export async function processSingleBookingData(bookingData) {
    try {
        logger.info({}, '🏁 PROCESS STEP 1: processSingleBookingData started');
        const bookingId = (bookingData.bookingId || bookingData.id)?.toString();
        logger.info({ bookingId, hasBookingData: !!bookingData }, '🔑 PROCESS STEP 2: Extracted booking ID');
        if (!bookingId) {
            logger.warn({ bookingData }, '❌ PROCESS STEP 2.1: Booking missing bookingId/id');
            return { success: false, action: 'skipped', table: 'Booking' };
        }
        logger.info({ bookingId }, '⚙️ PROCESS STEP 3: Starting data extraction and transformation');
        const { charges, payments, totalCharges, totalPayments, balance } = extractChargesAndPayments(bookingData);
        const infoItems = extractInfoItems(bookingData);
        const numNights = calculateNights(bookingData.arrival, bookingData.departure);
        const bdStatus = determineBDStatus(bookingData);
        const guestName = extractGuestName(bookingData);
        const phone = extractPhoneNumber(bookingData);
        const email = extractEmail(bookingData);
        logger.info({
            bookingId,
            guestName,
            phone: phone || 'none',
            status: bookingData.status,
            totalCharges: totalCharges.toString()
        }, '📊 PROCESS STEP 4: Data extraction completed');
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
            messages: [],
            infoItems,
            notes: bookingData.comments || 'no notes',
            bookingDate: formatDateSimple(bookingData.created || bookingData.bookingTime),
            modifiedDate: formatDateSimple(bookingData.modified || bookingData.modifiedTime),
            lastUpdatedBD: new Date(),
            raw: bookingData,
            BDStatus: bdStatus || 'Confirmed',
        };
        logger.info({ bookingId }, '📝 PROCESS STEP 5: Creating common data object');
        const newMessages = extractMessagesFromPayload(bookingData);
        commonData.messages = await mergeMessages(bookingId, newMessages);
        logger.info({
            bookingId,
            newMessagesCount: newMessages.length,
            totalMessagesCount: commonData.messages.length,
            preservedCount: commonData.messages.length - newMessages.length
        }, '📨 PROCESS STEP 5.1: Messages merged with historical data');
        const validatedData = validateBookingData(commonData);
        const validation = isValidBooking(validatedData);
        if (!validation.valid) {
            logger.error({
                bookingId,
                errors: validation.errors,
                data: validatedData
            }, '❌ PROCESS STEP 5.1: Booking data validation failed');
            logger.warn({ bookingId }, 'Attempting to save despite validation errors');
        }
        else {
            logger.info({ bookingId }, '✅ PROCESS STEP 5.2: Booking data validation passed');
        }
        logger.info({ bookingId }, '🔍 PROCESS STEP 6: Checking if booking exists in BD');
        const existing = await prisma.booking.findUnique({
            where: { bookingId }
        });
        logger.info({
            bookingId,
            existsInDB: !!existing,
            willCreateNew: !existing
        }, '📊 PROCESS STEP 7: Database check completed');
        logger.info({ bookingId }, '💾 PROCESS STEP 8: Starting database upsert operation');
        const result = await prisma.booking.upsert({
            where: { bookingId },
            create: validatedData,
            update: {
                ...validatedData,
                id: undefined,
            },
        });
        logger.info({
            bookingId,
            dbResultId: result.id,
            wasCreated: !existing
        }, '✅ PROCESS STEP 9: Database upsert completed');
        logger.info({
            bookingId,
            action: existing ? 'updated' : 'created',
            table: 'Booking',
            resultId: result.id,
            guestName: result.guestName,
            phone: result.phone,
            status: result.status,
            bdStatus: result.BDStatus
        }, '🎉 PROCESS STEP 10: Successfully synced to BD - Booking table');
        const finalResult = { success: true, action: existing ? 'updated' : 'created', table: 'Booking' };
        logger.info({ bookingId, finalResult }, '🏁 PROCESS STEP 11: Returning success result');
        return finalResult;
    }
    catch (error) {
        const bookingId = (bookingData?.bookingId || bookingData?.id)?.toString() || 'unknown';
        logger.error({
            bookingId,
            error: error.message,
            stack: error.stack,
            data: bookingData,
            constraint: error.code === 'P2002' ? 'unique_constraint' : error.code
        }, '💥 PROCESS ERROR: Failed to sync to BD - check constraints and data');
        const errorResult = { success: false, action: 'skipped', table: 'Booking' };
        logger.info({ bookingId, errorResult }, '🚫 PROCESS STEP 12: Returning error result');
        return errorResult;
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
