import { logger } from '../../utils/logger.js';

/**
 * Parse date string to Date object safely
 */
export function parseDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  
  try {
    // Handle different date formats from Beds24
    if (dateStr.includes('T')) {
      return new Date(dateStr);
    }
    
    // Handle YYYY-MM-DD format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return new Date(dateStr + 'T00:00:00Z');
    }
    
    return new Date(dateStr);
  } catch (error) {
    logger.warn({ dateStr, error }, 'Failed to parse date');
    return null;
  }
}

/**
 * Format date to simple YYYY-MM-DD string
 */
export function formatDateSimple(date: Date | string | null): string | null {
  if (!date) return null;
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toISOString().split('T')[0];
  } catch (error) {
    logger.warn({ date, error }, 'Failed to format date');
    return null;
  }
}

/**
 * Sum money amounts safely, handling different formats
 */
export function sumMoney(amounts: (string | number | null | undefined)[]): number {
  return amounts.reduce((total: number, amount) => {
    if (!amount) return total;
    
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return total + (isNaN(num) ? 0 : num);
  }, 0);
}

/**
 * Sanitize amount string to number
 */
export function sanitizeAmount(amount?: string | number | null): number {
  if (!amount && amount !== 0) return 0;
  
  if (typeof amount === 'number') return amount;
  
  // Clean string: remove currency symbols, commas, etc.
  const cleaned = amount.toString().replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Extract charges and payments from Beds24 booking data
 */
export function extractChargesAndPayments(bookingData: any): {
  charges: Array<{ type: string; description: string; amount: number }>;
  payments: Array<{ type: string; description: string; amount: number }>;
  totalCharges: number;
  totalPayments: number;
  balance: number;
} {
  const charges: Array<{ type: string; description: string; amount: number }> = [];
  const payments: Array<{ type: string; description: string; amount: number }> = [];

  // Extract charges
  if (bookingData.invoice && Array.isArray(bookingData.invoice)) {
    bookingData.invoice.forEach((item: any) => {
      if (item.amount && item.amount !== '0') {
        const amount = sanitizeAmount(item.amount);
        if (amount > 0) {
          charges.push({
            type: item.type || 'charge',
            description: item.description || 'Charge',
            amount: amount
          });
        }
      }
    });
  }

  // Extract payments
  if (bookingData.payment && Array.isArray(bookingData.payment)) {
    bookingData.payment.forEach((item: any) => {
      if (item.amount && item.amount !== '0') {
        const amount = sanitizeAmount(item.amount);
        if (amount > 0) {
          payments.push({
            type: item.type || 'payment',
            description: item.description || 'Payment',
            amount: amount
          });
        }
      }
    });
  }

  const totalCharges = sumMoney(charges.map(c => c.amount));
  const totalPayments = sumMoney(payments.map(p => p.amount));
  const balance = totalCharges - totalPayments;

  return {
    charges,
    payments,
    totalCharges,
    totalPayments,
    balance
  };
}

/**
 * Extract info items from Beds24 booking data
 */
export function extractInfoItems(bookingData: any): Array<{ 
  type: string; 
  value: string; 
  label?: string 
}> {
  const infoItems: Array<{ type: string; value: string; label?: string }> = [];

  // Extract custom fields
  if (bookingData.customfield && Array.isArray(bookingData.customfield)) {
    bookingData.customfield.forEach((field: any) => {
      if (field.value && field.value.trim()) {
        infoItems.push({
          type: 'customfield',
          value: field.value,
          label: field.name || field.label
        });
      }
    });
  }

  // Extract special requests
  if (bookingData.specialrequest) {
    infoItems.push({
      type: 'specialrequest',
      value: bookingData.specialrequest
    });
  }

  // Extract comments
  if (bookingData.comments) {
    infoItems.push({
      type: 'comments',
      value: bookingData.comments
    });
  }

  // Extract guest notes
  if (bookingData.guestNotes) {
    infoItems.push({
      type: 'guestNotes',
      value: bookingData.guestNotes
    });
  }

  return infoItems;
}

/**
 * Calculate number of nights between dates
 */
export function calculateNights(arrivalDate: string | null, departureDate: string | null): number {
  if (!arrivalDate || !departureDate) return 0;

  try {
    const arrival = new Date(arrivalDate);
    const departure = new Date(departureDate);
    const diffTime = departure.getTime() - arrival.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  } catch (error) {
    logger.warn({ arrivalDate, departureDate, error }, 'Failed to calculate nights');
    return 0;
  }
}

/**
 * Determine BDStatus based on booking data
 */
export function determineBDStatus(bookingData: any): string | null {
  const status = bookingData.status?.toLowerCase();
  
  if (!status) return null;

  // Map Beds24 status to our BDStatus
  switch (status) {
    case 'cancelled':
    case 'black':
      return 'Cancelada';
    
    case 'confirmed':
      return 'Futura Confirmada';
    
    case 'new':
    case 'tentative':
      return 'Futura Pendiente';
    
    case 'checkedin':
    case 'request':
      return 'Hospedado';
    
    case 'checkedout':
      return 'Finalizada';
    
    default:
      logger.debug({ status }, 'Unknown booking status, defaulting to null');
      return null;
  }
}

/**
 * Check if booking should be synced as lead
 */
export function shouldSyncAsLead(bookingData: any): boolean {
  const bdStatus = determineBDStatus(bookingData);
  return bdStatus === 'Futura Pendiente';
}

/**
 * Check if booking should be synced as confirmed
 */
export function shouldSyncAsConfirmed(bookingData: any): boolean {
  const bdStatus = determineBDStatus(bookingData);
  return bdStatus === 'Futura Confirmada';
}

/**
 * Check if booking is cancelled
 */
export function isCancelledBooking(bookingData: any): boolean {
  const bdStatus = determineBDStatus(bookingData);
  return bdStatus === 'Cancelada';
}

/**
 * Extract guest name with fallbacks for different API formats
 */
export function extractGuestName(bookingData: any): string | null {
  // Try different name field combinations
  if (bookingData.guestFirstName && bookingData.guestName) {
    return `${bookingData.guestFirstName} ${bookingData.guestName}`;
  }
  
  if (bookingData.guestName) {
    return bookingData.guestName;
  }
  
  if (bookingData.firstName && bookingData.lastName) {
    return `${bookingData.firstName} ${bookingData.lastName}`;
  }
  
  if (bookingData.firstName) {
    return bookingData.firstName;
  }
  
  // Fallback to reference or booking holder
  if (bookingData.reference) {
    return bookingData.reference;
  }
  
  if (bookingData.invoiceeId) {
    return `Guest ${bookingData.invoiceeId}`;
  }
  
  return null;
}

/**
 * Extract phone number with multiple fallback strategies
 */
export function extractPhoneNumber(bookingData: any): string | null {
  // Direct phone field
  if (bookingData.phone) {
    return cleanPhoneNumber(bookingData.phone);
  }
  
  // Phone from guest info
  if (bookingData.guestPhone) {
    return cleanPhoneNumber(bookingData.guestPhone);
  }
  
  // Extract from API reference (common for WhatsApp integrations)
  if (bookingData.apiReference) {
    const phoneFromApi = extractPhoneFromApiReference(bookingData.apiReference);
    if (phoneFromApi) {
      return phoneFromApi;
    }
  }
  
  // Extract from comments or notes
  const phoneFromNotes = extractPhoneFromText(
    `${bookingData.comments || ''} ${bookingData.notes || ''}`
  );
  if (phoneFromNotes) {
    return phoneFromNotes;
  }
  
  return null;
}

/**
 * Extract email address with fallbacks
 */
export function extractEmail(bookingData: any): string | null {
  if (bookingData.email) {
    return bookingData.email;
  }
  
  if (bookingData.guestEmail) {
    return bookingData.guestEmail;
  }
  
  // Extract from comments or notes
  const emailFromText = extractEmailFromText(
    `${bookingData.comments || ''} ${bookingData.notes || ''}`
  );
  
  return emailFromText;
}

/**
 * Combine all notes and comments into internal notes
 */
export function combineNotes(bookingData: any): string | null {
  const notes = [];
  
  if (bookingData.notes) {
    notes.push(bookingData.notes);
  }
  
  if (bookingData.comments) {
    notes.push(bookingData.comments);
  }
  
  if (bookingData.internalNotes) {
    notes.push(bookingData.internalNotes);
  }
  
  // Add channel info if available
  if (bookingData.channel || bookingData.referer) {
    notes.push(`Source: ${bookingData.channel || bookingData.referer}`);
  }
  
  return notes.length > 0 ? notes.join(' | ') : null;
}

/**
 * Calculate total persons with validation
 */
export function calculateTotalPersons(bookingData: any): number | null {
  const adults = parseInt(bookingData.numAdult || bookingData.adults || '0') || 0;
  const children = parseInt(bookingData.numChild || bookingData.children || '0') || 0;
  const total = adults + children;
  
  return total > 0 ? total : null;
}

/**
 * Determine channel with enhanced logic
 */
export function determineChannel(bookingData: any): string | null {
  // Priority order for channel detection
  if (bookingData.channel) {
    return bookingData.channel;
  }
  
  if (bookingData.referer) {
    return bookingData.referer;
  }
  
  if (bookingData.source) {
    return bookingData.source;
  }
  
  // Map API source to readable channel names
  if (bookingData.apiSourceId || bookingData.apiSource) {
    return mapApiSourceToChannel(bookingData.apiSourceId, bookingData.apiSource);
  }
  
  return null;
}

/**
 * Extract messages array from booking data
 */
export function extractMessages(bookingData: any): any[] {
  if (bookingData.messages && Array.isArray(bookingData.messages)) {
    return bookingData.messages.map((msg: any) => ({
      id: msg.id,
      message: msg.message,
      time: msg.time,
      source: msg.source,
      read: msg.read || false,
    }));
  }
  
  return [];
}

/**
 * Map property ID to property name (implement based on your mapping)
 */
export function mapPropertyName(propertyId: number | string): string | null {
  // TODO: Implement property mapping based on your configuration
  // This could be a lookup table or API call
  const propertyMap: Record<string, string> = {
    '173207': '2005-A',
    '173307': '1820',
    '173308': '1317',
    '173309': '1722-B',
    '173311': '2005-B',
    '173312': '1722-A',
    '240061': '0715',
    // Mapped from Beds24 API on 2025-08-30
  };
  
  return propertyMap[String(propertyId)] || null;
}

// Helper functions

/**
 * Clean and validate phone number
 */
function cleanPhoneNumber(phone: string): string {
  // Remove non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Ensure international format
  if (!cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }
  
  return cleaned;
}

/**
 * Extract phone from API reference (common format: whatsapp_+1234567890)
 */
function extractPhoneFromApiReference(apiRef: string): string | null {
  const phoneMatch = apiRef.match(/(\+?\d{10,15})/);
  return phoneMatch ? cleanPhoneNumber(phoneMatch[1]) : null;
}

/**
 * Extract phone number from text using regex
 */
function extractPhoneFromText(text: string): string | null {
  const phonePattern = /(\+?\d{1,4}[\s-]?\d{10,15})/;
  const match = text.match(phonePattern);
  return match ? cleanPhoneNumber(match[1]) : null;
}

/**
 * Extract email from text using regex
 */
function extractEmailFromText(text: string): string | null {
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const match = text.match(emailPattern);
  return match ? match[0] : null;
}

/**
 * Map API source ID to readable channel name
 */
function mapApiSourceToChannel(apiSourceId: number, apiSource: string): string {
  const sourceMap: Record<number, string> = {
    1: 'Booking.com',
    2: 'Airbnb',
    3: 'Expedia',
    4: 'Direct',
    // Add more mappings as needed
  };
  
  return sourceMap[apiSourceId] || apiSource || 'Unknown';
}