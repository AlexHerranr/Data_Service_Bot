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
  isCancelledBooking
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
 * Sync a single booking from Beds24 to database
 */
export async function syncSingleBooking(bookingData: any): Promise<{
  success: boolean;
  action: 'created' | 'updated' | 'skipped';
  table: 'Booking' | 'Leads' | 'ReservationsCancelled';
}> {
  try {
    const bookingId = bookingData.bookingId?.toString();
    if (!bookingId) {
      logger.warn({ bookingData }, 'Booking missing bookingId');
      return { success: false, action: 'skipped', table: 'Booking' };
    }

    // Extract data from booking
    const { charges, payments, totalCharges, totalPayments, balance } = extractChargesAndPayments(bookingData);
    const infoItems = extractInfoItems(bookingData);
    const numNights = calculateNights(bookingData.arrival, bookingData.departure);
    const bdStatus = determineBDStatus(bookingData);

    // Common booking data
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

    // Handle different booking types
    if (isCancelledBooking(bookingData)) {
      return await syncCancelledBooking(commonData);
    } else if (shouldSyncAsLead(bookingData) || shouldSyncAsConfirmed(bookingData)) {
      return await syncActiveBooking(commonData);
    } else {
      // Regular booking - sync to main Booking table
      const existing = await prisma.reservas.findUnique({
        where: { bookingId }
      });

      const result = await prisma.reservas.upsert({
        where: { bookingId },
        create: commonData,
        update: {
          ...commonData,
          id: undefined, // Don't update ID
        },
      });

      logger.debug({ bookingId, action: existing ? 'updated' : 'created' }, 'Synced booking to main table');
      return { success: true, action: existing ? 'updated' : 'created', table: 'Booking' };
    }

  } catch (error: any) {
    logger.error({ error: error.message, bookingId: bookingData.bookingId }, 'Failed to sync single booking');
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

    // If it's a lead, also sync to Leads table via database trigger
    // The trigger will handle the Leads table sync automatically
    // based on BDStatus = 'Futura Pendiente'

    logger.debug({ 
      bookingId: bookingData.bookingId, 
      bdStatus: bookingData.BDStatus,
      action: existingBooking ? 'updated' : 'created' 
    }, 'Synced active booking');

    return { success: true, action: existingBooking ? 'updated' : 'created', table: 'Booking' };

  } catch (error: any) {
    logger.error({ error: error.message, bookingId: bookingData.bookingId }, 'Failed to sync active booking');
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

      const syncResult = await syncSingleBooking(booking);
      
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
      const syncResult = await syncSingleBooking(booking);
      
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
          await syncSingleBooking(booking);
          processed++;
        } catch (error: any) {
          errors.push(`Booking ${booking.bookingId}: ${error.message}`);
        }
      }
    } else if (webhookData.bookingId) {
      // Single booking webhook
      try {
        await syncSingleBooking(webhookData);
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