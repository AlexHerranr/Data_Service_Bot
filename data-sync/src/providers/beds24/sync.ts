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
import { validateBookingData, isValidBooking } from './validators.js';
import { mergeMessages, extractMessagesFromPayload } from './message-handler.js';
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
    logger.info({ bookingId }, '🔍 SYNC STEP A: syncSingleBooking started');
    
    if (String(bookingId).startsWith('999')) {
      logger.debug({ bookingId }, '🧪 SYNC STEP A.1: Skipping test booking');
      return { success: true, action: 'skipped', table: 'Booking' };
    }

    logger.info({ bookingId }, '🚀 SYNC STEP B: Starting sync for booking');

    // Fetch complete booking data from Beds24 API
    logger.info({ bookingId }, '🌐 SYNC STEP C: Getting Beds24 client');
    const client = getBeds24Client();
    
    logger.info({ bookingId }, '📡 SYNC STEP D: Fetching booking from Beds24 API');
    const bookingData = await client.getBooking(bookingId);

    if (!bookingData) {
      logger.warn({ bookingId }, '⚠️ SYNC STEP D.1: Booking not found in Beds24');
      return { success: false, action: 'skipped', table: 'Booking' };
    }

    logger.info({ bookingId, hasData: !!bookingData }, '✅ SYNC STEP E: Fetched complete booking data from API');

    // Process the complete booking data
    logger.info({ bookingId }, '⚙️ SYNC STEP F: Starting processSingleBookingData');
    return await processSingleBookingData(bookingData);

  } catch (error: any) {
    logger.error({ 
      error: error.message, 
      stack: error.stack,
      bookingId 
    }, '💥 SYNC ERROR: Failed to sync single booking');
    return { success: false, action: 'skipped', table: 'Booking' };
  }
}

/**
 * Process booking data (used by both sync methods)
 */
export async function processSingleBookingData(bookingData: any): Promise<{
  success: boolean;
  action: 'created' | 'updated' | 'skipped' | 'skipped-recent';
  table: 'Booking' | 'Leads' | 'ReservationsCancelled';
}> {
  try {
    logger.info({}, '🏁 PROCESS STEP 1: processSingleBookingData started');
    
    // Extract booking ID from different possible fields
    const bookingId = (bookingData.bookingId || bookingData.id)?.toString();
    logger.info({ bookingId, hasBookingData: !!bookingData }, '🔑 PROCESS STEP 2: Extracted booking ID');
    
    if (!bookingId) {
      logger.warn({ bookingData }, '❌ PROCESS STEP 2.1: Booking missing bookingId/id');
      return { success: false, action: 'skipped', table: 'Booking' };
    }

    logger.info({ bookingId }, '⚙️ PROCESS STEP 3: Starting data extraction and transformation');
    
    // Extract and transform data from complete Beds24 API response
    const { charges, payments, totalCharges, totalPayments, balance } = extractChargesAndPayments(bookingData);
    const infoItems = extractInfoItems(bookingData);
    const numNights = calculateNights(bookingData.arrival, bookingData.departure);
    const bdStatus = determineBDStatus(bookingData);

    // Enhanced guest information extraction
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
      basePrice: bookingData.price != null ? String(bookingData.price) : null,
      channel: determineChannel(bookingData) || 'unknown',
      email: email || 'unknown',
      apiReference: bookingData.apiReference || null,
      charges: charges,
      payments: payments,
      messages: [], // Se llenará después con merge
      infoItems,
      notes: bookingData.comments || 'no notes',
      bookingDate: formatDateSimple(bookingData.created || bookingData.bookingTime),
      modifiedDate: formatDateSimple(bookingData.modified || bookingData.modifiedTime),
      lastUpdatedBD: new Date(),
      raw: bookingData, // Always store complete API response
      BDStatus: bdStatus || 'Confirmed',
    };

    logger.info({ bookingId }, '📝 PROCESS STEP 5: Creating common data object');

    // Inteligent message handling - preserve old messages and add new ones
    const newMessages = extractMessagesFromPayload(bookingData);
    commonData.messages = await mergeMessages(bookingId, newMessages) as any;
    
    logger.info({ 
      bookingId, 
      newMessagesCount: newMessages.length,
      totalMessagesCount: commonData.messages.length,
      preservedCount: commonData.messages.length - newMessages.length
    }, '📨 PROCESS STEP 5.1: Messages merged with historical data');
    
    // Validate all data before saving
    const validatedData = validateBookingData(commonData);
    const validation = isValidBooking(validatedData);
    
    if (!validation.valid) {
      logger.error({ 
        bookingId, 
        errors: validation.errors,
        data: validatedData 
      }, '❌ PROCESS STEP 5.1: Booking data validation failed');
      
      // Still try to save with validated data, but log the issues
      logger.warn({ bookingId }, 'Attempting to save despite validation errors');
    } else {
      logger.info({ bookingId }, '✅ PROCESS STEP 5.2: Booking data validation passed');
    }

    logger.info({ bookingId }, '🔍 PROCESS STEP 6: Checking if booking exists in BD');
    
    // Sync ALL bookings to main Booking table (simplified routing)
    const existing = await prisma.booking.findUnique({
      where: { bookingId }
    });
    
    // Check if booking was recently updated (within last 2 minutes)
    if (existing && existing.lastUpdatedBD) {
      const timeSinceLastUpdate = Date.now() - new Date(existing.lastUpdatedBD).getTime();
      if (timeSinceLastUpdate < 2 * 60 * 1000) { // Less than 2 minutes
        logger.warn({ 
          bookingId,
          lastUpdatedBD: existing.lastUpdatedBD,
          secondsSinceUpdate: Math.floor(timeSinceLastUpdate / 1000)
        }, 'Booking was recently updated - skipping to avoid duplicate processing');
        
        return { success: true, action: 'skipped-recent', table: 'Booking' } as const;
      }
    }
    
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
        id: undefined, // Don't update ID
      },
    });
    
    // Database operation result logging
    const dbAction = existing ? 'UPDATE' : 'INSERT';
    
    // Critical log for database confirmation
    logger.info({ 
      event: 'DB_OPERATION_SUCCESS',
      operation: 'UPSERT',
      action: dbAction,
      bookingId: bookingId,
      dbId: result.id,
      wasExisting: !!existing,
      timestamp: new Date().toISOString()
    }, `Database ${dbAction} completed for booking ${bookingId}`);

    // Detailed booking data for verification
    logger.info({ 
      event: 'BOOKING_DATA_SAVED',
      bookingId: bookingId,
      dbId: result.id,
      guestName: result.guestName,
      propertyName: result.propertyName,
      status: result.status,
      bdStatus: result.BDStatus,
      arrivalDate: result.arrivalDate,
      departureDate: result.departureDate,
      numNights: result.numNights,
      totalPersons: result.totalPersons,
      totalCharges: result.totalCharges,
      totalPayments: result.totalPayments,
      balance: result.balance,
      phone: result.phone || null,
      email: result.email || null,
      channel: result.channel,
      lastUpdatedBD: result.lastUpdatedBD,
      timestamp: new Date().toISOString()
    }, `Booking data saved: ${bookingId} - ${result.guestName}`);
    
    const finalResult = { success: true, action: existing ? 'updated' : 'created', table: 'Booking' } as const;
    logger.info({ bookingId, finalResult }, '🏁 PROCESS STEP 11: Returning success result');
    
    return finalResult;

  } catch (error: any) {
    const bookingId = (bookingData?.bookingId || bookingData?.id)?.toString() || 'unknown';
    
    // Structured error logging
    logger.error({ 
      event: 'DB_OPERATION_FAILED',
      bookingId: bookingId,
      errorCode: error.code || 'UNKNOWN',
      errorMessage: error.message,
      errorType: error.code === 'P2002' ? 'UNIQUE_CONSTRAINT_VIOLATION' : 'DATABASE_ERROR',
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, `Database operation failed for booking ${bookingId}: ${error.message}`);
    
    return { success: false, action: 'skipped', table: 'Booking' } as const;
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