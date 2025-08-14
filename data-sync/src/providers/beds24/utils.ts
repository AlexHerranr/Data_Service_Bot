import { logger } from '../../utils/logger';

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