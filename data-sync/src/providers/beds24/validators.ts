/**
 * Validators for Beds24 booking data
 */

import { logger } from '../../utils/logger.js';

/**
 * Validate and sanitize monetary values
 */
export function validateMonetaryValue(value: any, fieldName: string, defaultValue: string = '0'): string {
  try {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    
    // Convert to number and back to string to ensure it's a valid number
    const numValue = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    
    if (isNaN(numValue)) {
      logger.warn(`Invalid monetary value for ${fieldName}: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
    
    // Round to 2 decimal places and convert to string
    return numValue.toFixed(2);
  } catch (error) {
    logger.error(`Error validating monetary value for ${fieldName}: ${error}`);
    return defaultValue;
  }
}

/**
 * Validate date format (YYYY-MM-DD)
 */
export function validateDate(dateStr: any, fieldName: string): string | null {
  try {
    if (!dateStr) return null;
    
    // Try to parse the date
    const date = new Date(dateStr);
    
    if (isNaN(date.getTime())) {
      logger.warn(`Invalid date for ${fieldName}: ${dateStr}`);
      return null;
    }
    
    // Return in YYYY-MM-DD format
    return date.toISOString().split('T')[0];
  } catch (error) {
    logger.error(`Error validating date for ${fieldName}: ${error}`);
    return null;
  }
}

/**
 * Validate phone number
 */
export function validatePhone(phone: any): string {
  if (!phone || phone === 'unknown' || phone === '') {
    return 'unknown';
  }
  
  // Remove all non-numeric characters except +
  const cleaned = String(phone).replace(/[^0-9+]/g, '');
  
  // If too short, mark as unknown
  if (cleaned.length < 7) {
    logger.warn(`Phone number too short: ${phone}`);
    return 'unknown';
  }
  
  // Truncate if too long (DB field limits)
  if (cleaned.length > 20) {
    return cleaned.substring(0, 20);
  }
  
  return cleaned;
}

/**
 * Validate email
 */
export function validateEmail(email: any): string {
  if (!email || email === 'unknown' || email === '') {
    return 'unknown';
  }
  
  const emailStr = String(email).toLowerCase().trim();
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(emailStr)) {
    logger.warn(`Invalid email format: ${email}`);
    return 'unknown';
  }
  
  // Truncate if too long
  if (emailStr.length > 100) {
    return emailStr.substring(0, 100);
  }
  
  return emailStr;
}

/**
 * Validate and truncate string fields
 */
export function validateString(value: any, fieldName: string, maxLength: number = 255, defaultValue: string = ''): string {
  try {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    const strValue = String(value).trim();
    
    if (strValue.length === 0) {
      return defaultValue;
    }
    
    if (strValue.length > maxLength) {
      logger.warn(`Truncating ${fieldName} from ${strValue.length} to ${maxLength} characters`);
      return strValue.substring(0, maxLength);
    }
    
    return strValue;
  } catch (error) {
    logger.error(`Error validating string for ${fieldName}: ${error}`);
    return defaultValue;
  }
}

/**
 * Validate integer values
 */
export function validateInteger(value: any, fieldName: string, defaultValue: number = 0): number {
  try {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    
    const intValue = parseInt(String(value), 10);
    
    if (isNaN(intValue)) {
      logger.warn(`Invalid integer value for ${fieldName}: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
    
    return intValue;
  } catch (error) {
    logger.error(`Error validating integer for ${fieldName}: ${error}`);
    return defaultValue;
  }
}

/**
 * Validate JSON fields
 */
export function validateJson(value: any, fieldName: string, defaultValue: any = []): any {
  try {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    // If it's already an object/array, return it
    if (typeof value === 'object') {
      return value;
    }
    
    // Try to parse if it's a string
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        logger.warn(`Invalid JSON string for ${fieldName}, using default`);
        return defaultValue;
      }
    }
    
    return defaultValue;
  } catch (error) {
    logger.error(`Error validating JSON for ${fieldName}: ${error}`);
    return defaultValue;
  }
}

/**
 * Validate the complete booking data before saving
 */
export function validateBookingData(data: any): any {
  const validated = { ...data };
  
  // Validate monetary fields
  validated.totalCharges = validateMonetaryValue(data.totalCharges, 'totalCharges');
  validated.totalPayments = validateMonetaryValue(data.totalPayments, 'totalPayments');
  validated.balance = validateMonetaryValue(data.balance, 'balance');
  
  if (data.basePrice !== null && data.basePrice !== undefined) {
    validated.basePrice = validateMonetaryValue(data.basePrice, 'basePrice');
  }
  
  // Validate dates
  validated.arrivalDate = validateDate(data.arrivalDate, 'arrivalDate');
  validated.departureDate = validateDate(data.departureDate, 'departureDate');
  validated.bookingDate = validateDate(data.bookingDate, 'bookingDate');
  validated.modifiedDate = validateDate(data.modifiedDate, 'modifiedDate');
  
  // Validate contact info
  validated.phone = validatePhone(data.phone);
  validated.email = validateEmail(data.email);
  
  // Validate strings with length limits
  validated.guestName = validateString(data.guestName, 'guestName', 100, 'Guest Unknown');
  validated.status = validateString(data.status, 'status', 50, 'confirmed');
  validated.channel = validateString(data.channel, 'channel', 50, 'unknown');
  validated.propertyName = validateString(data.propertyName, 'propertyName', 100, 'Unknown Property');
  validated.BDStatus = validateString(data.BDStatus, 'BDStatus', 50, 'Confirmed');
  
  // Validate integers
  validated.numNights = validateInteger(data.numNights, 'numNights', 1);
  validated.totalPersons = validateInteger(data.totalPersons, 'totalPersons', 1);
  
  // Validate JSON fields
  validated.charges = validateJson(data.charges, 'charges', []);
  validated.payments = validateJson(data.payments, 'payments', []);
  validated.messages = validateJson(data.messages, 'messages', []);
  validated.infoItems = validateJson(data.infoItems, 'infoItems', []);
  
  // Ensure raw data is valid JSON
  if (data.raw) {
    validated.raw = validateJson(data.raw, 'raw', {});
  }
  
  // Log validation summary
  logger.debug({
    bookingId: validated.bookingId,
    validatedFields: {
      monetary: ['totalCharges', 'totalPayments', 'balance', 'basePrice'],
      dates: ['arrivalDate', 'departureDate', 'bookingDate', 'modifiedDate'],
      contact: ['phone', 'email'],
      json: ['charges', 'payments', 'messages', 'infoItems', 'raw']
    }
  }, 'Booking data validation completed');
  
  // leadType - Agregar campo por defecto para evitar errores de constraint
  // Este campo parece ser requerido por algún trigger o constraint en la BD
  (validated as any).leadType = data.leadType || 'booking';
  
  return validated;
}

/**
 * Check if booking data is valid for saving
 */
export function isValidBooking(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required fields
  if (!data.bookingId) {
    errors.push('Missing bookingId');
  }
  
  if (!data.arrivalDate) {
    errors.push('Missing or invalid arrivalDate');
  }
  
  if (!data.departureDate) {
    errors.push('Missing or invalid departureDate');
  }
  
  // Logical validations
  if (data.arrivalDate && data.departureDate) {
    const arrival = new Date(data.arrivalDate);
    const departure = new Date(data.departureDate);
    
    if (arrival >= departure) {
      errors.push('Arrival date must be before departure date');
    }
  }
  
  // Monetary validations
  const totalCharges = parseFloat(data.totalCharges || '0');
  const totalPayments = parseFloat(data.totalPayments || '0');
  const balance = parseFloat(data.balance || '0');
  
  // Allow small rounding differences (0.01)
  const calculatedBalance = totalCharges - totalPayments;
  if (Math.abs(calculatedBalance - balance) > 0.01) {
    logger.warn({
      totalCharges,
      totalPayments,
      balance,
      calculatedBalance,
      difference: Math.abs(calculatedBalance - balance)
    }, 'Balance calculation mismatch');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}