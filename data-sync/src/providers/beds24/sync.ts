import { getBeds24Client } from './client.js';
import { 
  parseDate, 
  formatDateSimple, 
  extractChargesAndPayments, 
  extractInfoItems, 
  calculateNights, 
  determineBDStatus,
  shouldSyncAsLead,
  shouldSyncAsConfirmed,
  isCancelledBooking,
  extractGuestName,
  extractPhoneNumber,
  extractEmail,
  combineNotes,
  calculateTotalPersons,
  determineChannel,
  extractMessages,
  mapPropertyName
} from './utils.js';
import { prisma } from '../../infra/db/prisma.client.js';
import { logger } from '../../utils/logger.js';

export interface SyncResult {
  processed: number;
  upserted: number;
  skipped: number;
  errors: number;
}

export interface LeadsAndConfirmedResult {
  confirmed: number;
  leads: number;
  skipped: number;
}

/**
 * Sync a single booking by ID - fetches complete data from Beds24 API
 */
export async function syncSingleBooking(bookingId: string): Promise<{
  success: boolean;
  action: 'created' | 'updated' | 'skipped';
  table: 'Booking' | 'Leads' | 'ReservationsCancelled';
}> {
  try {
    if (String(bookingId).startsWith('999')) {
      logger.debug({ bookingId }, 'Skipping test booking');
      return { success: true, action: 'skipped', table: 'Booking' };
    }

    logger.info({ bookingId }, 'Starting sync for booking');

    // Fetch complete booking data from Beds24 API
    const client = getBeds24Client();
    const bookingData = await client.getBooking(bookingId);

    if (!bookingData) {
      logger.warn({ bookingId }, 'Booking not found in Beds24');
      return { success: false, action: 'skipped', table: 'Booking' };
    }

    logger.debug({ bookingId, bookingData }, 'Fetched complete booking data from API');

    // Process the complete booking data
    return await processSingleBookingData(bookingData);

  } catch (error: any) {
    logger.error({ error: error.message, bookingId }, 'Failed to sync single booking');
    return { success: false, action: 'skipped', table: 'Booking' };
  }
}

/**
 * Process booking data (used by both sync methods)
 */
export async function processSingleBookingData(bookingData: any): Promise<{
  success: boolean;
  action: 'created' | 'updated' | 'skipped';
  table: 'Booking' | 'Leads' | 'ReservationsCancelled';
}> {
  try {
    // Extract booking ID from different possible fields
    const bookingId = (bookingData.bookingId || bookingData.id)?.toString();
    if (!bookingId) {
      logger.warn({ bookingData }, 'Booking missing bookingId/id');
      return { success: false, action: 'skipped', table: 'Booking' };
    }

    // Extract and transform data from complete Beds24 API response
    const { charges, payments, totalCharges, totalPayments, balance } = extractChargesAndPayments(bookingData);
    const infoItems = extractInfoItems(bookingData);
    const numNights = calculateNights(bookingData.arrival, bookingData.departure);
    const bdStatus = determineBDStatus(bookingData);

    // Enhanced guest information extraction
    const guestName = extractGuestName(bookingData);
    const phone = extractPhoneNumber(bookingData);
    const email = extractEmail(bookingData);

    // Enhanced booking data with more complete information and null-safe defaults
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
      basePrice: bookingData.price || null,
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
      raw: bookingData, // Always store complete API response
      BDStatus: bdStatus || 'Confirmed',
    };

    // Enhanced message handling for MODIFY actions
    if (bookingData.action === 'MODIFY' || bookingData.action === 'modified') {
      commonData.messages = extractMessages(bookingData);
      logger.debug({ bookingId, messageCount: commonData.messages?.length || 0 }, 'Enhanced message extraction for MODIFY action');
    }

    // Handle different booking types
    if (isCancelledBooking(bookingData)) {
      return await syncCancelledBooking(commonData);
    } else if (shouldSyncAsLead(bookingData) || shouldSyncAsConfirmed(bookingData)) {
      return await syncActiveBooking(commonData);
    } else {
      // Regular booking - sync to main Booking table
      const existing = await prisma.booking.findUnique({
        where: { bookingId }
      });

      const result = await prisma.booking.upsert({
        where: { bookingId },
        create: commonData,
        update: {
          ...commonData,
          id: undefined, // Don't update ID
        },
      });

      logger.info({ 
        bookingId, 
        action: existing ? 'updated' : 'created',
        table: 'Booking',
        resultId: result.id,
        guestName: result.guestName,
        phone: result.phone
      }, '✅ Successfully synced to BD - Booking table');
      return { success: true, action: existing ? 'updated' : 'created', table: 'Booking' };
    }

  } catch (error: any) {
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

/**
 * Sync cancelled booking to ReservationsCancelled
 */
async function syncCancelledBooking(bookingData: any): Promise<{
  success: boolean;
  action: 'created' | 'updated' | 'skipped';
  table: 'ReservationsCancelled';
}> {
  try {
    const existing = await prisma.booking.findUnique({
      where: { bookingId: bookingData.bookingId }
    });

    await prisma.booking.upsert({
      where: { bookingId: bookingData.bookingId },
      create: {
        ...bookingData,
        status: 'cancelled', // Mark as cancelled in status field
      },
      update: {
        ...bookingData,
        id: undefined,
        status: 'cancelled', // Mark as cancelled in status field
      },
    });

    logger.debug({ bookingId: bookingData.bookingId, action: existing ? 'updated' : 'created' }, 'Synced cancelled booking');
    return { success: true, action: existing ? 'updated' : 'created', table: 'ReservationsCancelled' };

  } catch (error: any) {
    logger.error({ error: error.message, bookingId: bookingData.bookingId }, 'Failed to sync cancelled booking');
    return { success: false, action: 'skipped', table: 'ReservationsCancelled' };
  }
}

/**
 * Sync active booking (leads or confirmed)
 */
async function syncActiveBooking(bookingData: any): Promise<{
  success: boolean;
  action: 'created' | 'updated' | 'skipped';
  table: 'Booking' | 'Leads';
}> {
  try {
    // Always sync to main Booking table first
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

    // If it's a lead, also sync to Leads table via database trigger
    // The trigger will handle the Leads table sync automatically
    // based on BDStatus = 'Futura Pendiente'

    logger.info({ 
      bookingId: bookingData.bookingId, 
      bdStatus: bookingData.BDStatus,
      action: existingBooking ? 'updated' : 'created',
      resultId: activeResult.id,
      table: 'Booking'
    }, '✅ Successfully synced active booking to BD');

    return { success: true, action: existingBooking ? 'updated' : 'created', table: 'Booking' };

  } catch (error: any) {
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

/**
 * Sync cancelled reservations from Beds24
 */
export async function syncCancelledReservations(
  fromDate?: string,
  toDate?: string
): Promise<SyncResult> {
  const client = getBeds24Client();
  const result: SyncResult = { processed: 0, upserted: 0, skipped: 0, errors: 0 };

  try {
    logger.info({ fromDate, toDate }, 'Starting cancelled reservations sync');

    // Default date range: last 2 years to cover all historical cancelled bookings
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
        } else {
          result.skipped++;
        }
      } else {
        result.errors++;
      }

      // Log progress every 100 bookings
      if (result.processed % 100 === 0) {
        logger.info({ progress: result }, 'Sync progress update');
      }
    }

    logger.info({ result }, 'Completed cancelled reservations sync');
    return result;

  } catch (error: any) {
    logger.error({ error: error.message, result }, 'Failed to sync cancelled reservations');
    throw error;
  }
}

/**
 * Sync leads and confirmed reservations from Beds24
 */
export async function syncLeadsAndConfirmed(
  fromDate?: string,
  toDate?: string
): Promise<LeadsAndConfirmedResult> {
  const client = getBeds24Client();
  const result: LeadsAndConfirmedResult = { confirmed: 0, leads: 0, skipped: 0 };

  try {
    logger.info({ fromDate, toDate }, 'Starting leads and confirmed sync');

    // Default date range: next 6 months for future bookings
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
        } else if (shouldSyncAsConfirmed(booking)) {
          result.confirmed++;
        }
      } else {
        result.skipped++;
      }

      // Log progress every 100 bookings
      if ((result.confirmed + result.leads + result.skipped) % 100 === 0) {
        logger.info({ progress: result }, 'Sync progress update');
      }
    }

    logger.info({ result }, 'Completed leads and confirmed sync');
    return result;

  } catch (error: any) {
    logger.error({ error: error.message, result }, 'Failed to sync leads and confirmed');
    throw error;
  }
}

/**
 * Full sync: both cancelled and active reservations
 */
export async function fullSync(options: {
  cancelledFromDate?: string;
  cancelledToDate?: string;
  activeFromDate?: string;
  activeToDate?: string;
} = {}): Promise<{
  cancelled: SyncResult;
  active: LeadsAndConfirmedResult;
}> {
  logger.info({ options }, 'Starting full Beds24 sync');

  try {
    // Sync cancelled bookings first
    const cancelled = await syncCancelledReservations(
      options.cancelledFromDate,
      options.cancelledToDate
    );

    // Then sync active bookings (leads and confirmed)
    const active = await syncLeadsAndConfirmed(
      options.activeFromDate,
      options.activeToDate
    );

    const finalResult = { cancelled, active };
    logger.info({ result: finalResult }, 'Completed full Beds24 sync');
    
    return finalResult;

  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to complete full sync');
    throw error;
  }
}

/**
 * Process Beds24 webhook data
 */
export async function processWebhook(webhookData: any): Promise<{
  success: boolean;
  processed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let processed = 0;

  try {
    logger.info({ webhookData }, 'Processing Beds24 webhook');

    // Handle different webhook types
    if (webhookData.bookings && Array.isArray(webhookData.bookings)) {
      // Multiple bookings in webhook
      for (const booking of webhookData.bookings) {
        try {
          await processSingleBookingData(booking);
          processed++;
        } catch (error: any) {
          errors.push(`Booking ${booking.bookingId}: ${error.message}`);
        }
      }
    } else if (webhookData.bookingId) {
      // Single booking webhook
      try {
        await processSingleBookingData(webhookData);
        processed++;
      } catch (error: any) {
        errors.push(`Booking ${webhookData.bookingId}: ${error.message}`);
      }
    } else {
      errors.push('Invalid webhook format: no booking data found');
    }

    logger.info({ processed, errors: errors.length }, 'Completed webhook processing');
    
    return {
      success: errors.length === 0,
      processed,
      errors
    };

  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to process webhook');
    return {
      success: false,
      processed,
      errors: [error.message]
    };
  }
}