import { logger } from '../../utils/logger.js';
export function validateMonetaryValue(value, fieldName, defaultValue = '0') {
    try {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        const numValue = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
        if (isNaN(numValue)) {
            logger.warn(`Invalid monetary value for ${fieldName}: ${value}, using default: ${defaultValue}`);
            return defaultValue;
        }
        return numValue.toFixed(2);
    }
    catch (error) {
        logger.error(`Error validating monetary value for ${fieldName}: ${error}`);
        return defaultValue;
    }
}
export function validateDate(dateStr, fieldName) {
    try {
        if (!dateStr)
            return null;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            logger.warn(`Invalid date for ${fieldName}: ${dateStr}`);
            return null;
        }
        return date.toISOString().split('T')[0];
    }
    catch (error) {
        logger.error(`Error validating date for ${fieldName}: ${error}`);
        return null;
    }
}
export function validatePhone(phone) {
    if (!phone || phone === 'unknown' || phone === '') {
        return 'unknown';
    }
    const cleaned = String(phone).replace(/[^0-9+]/g, '');
    if (cleaned.length < 7) {
        logger.warn(`Phone number too short: ${phone}`);
        return 'unknown';
    }
    if (cleaned.length > 20) {
        return cleaned.substring(0, 20);
    }
    return cleaned;
}
export function validateEmail(email) {
    if (!email || email === 'unknown' || email === '') {
        return 'unknown';
    }
    const emailStr = String(email).toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailStr)) {
        logger.warn(`Invalid email format: ${email}`);
        return 'unknown';
    }
    if (emailStr.length > 100) {
        return emailStr.substring(0, 100);
    }
    return emailStr;
}
export function validateString(value, fieldName, maxLength = 255, defaultValue = '') {
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
    }
    catch (error) {
        logger.error(`Error validating string for ${fieldName}: ${error}`);
        return defaultValue;
    }
}
export function validateInteger(value, fieldName, defaultValue = 0) {
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
    }
    catch (error) {
        logger.error(`Error validating integer for ${fieldName}: ${error}`);
        return defaultValue;
    }
}
export function validateJson(value, fieldName, defaultValue = []) {
    try {
        if (value === null || value === undefined) {
            return defaultValue;
        }
        if (typeof value === 'object') {
            return value;
        }
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            }
            catch {
                logger.warn(`Invalid JSON string for ${fieldName}, using default`);
                return defaultValue;
            }
        }
        return defaultValue;
    }
    catch (error) {
        logger.error(`Error validating JSON for ${fieldName}: ${error}`);
        return defaultValue;
    }
}
export function validateBookingData(data) {
    const validated = { ...data };
    validated.totalCharges = validateMonetaryValue(data.totalCharges, 'totalCharges');
    validated.totalPayments = validateMonetaryValue(data.totalPayments, 'totalPayments');
    validated.balance = validateMonetaryValue(data.balance, 'balance');
    if (data.basePrice !== null && data.basePrice !== undefined) {
        validated.basePrice = validateMonetaryValue(data.basePrice, 'basePrice');
    }
    validated.arrivalDate = validateDate(data.arrivalDate, 'arrivalDate');
    validated.departureDate = validateDate(data.departureDate, 'departureDate');
    validated.bookingDate = validateDate(data.bookingDate, 'bookingDate');
    validated.modifiedDate = validateDate(data.modifiedDate, 'modifiedDate');
    validated.phone = validatePhone(data.phone);
    validated.email = validateEmail(data.email);
    validated.guestName = validateString(data.guestName, 'guestName', 100, 'Guest Unknown');
    validated.status = validateString(data.status, 'status', 50, 'confirmed');
    validated.channel = validateString(data.channel, 'channel', 50, 'unknown');
    validated.propertyName = validateString(data.propertyName, 'propertyName', 100, 'Unknown Property');
    validated.BDStatus = validateString(data.BDStatus, 'BDStatus', 50, 'Confirmed');
    validated.numNights = validateInteger(data.numNights, 'numNights', 1);
    validated.totalPersons = validateInteger(data.totalPersons, 'totalPersons', 1);
    validated.charges = validateJson(data.charges, 'charges', []);
    validated.payments = validateJson(data.payments, 'payments', []);
    validated.messages = validateJson(data.messages, 'messages', []);
    validated.infoItems = validateJson(data.infoItems, 'infoItems', []);
    if (data.raw) {
        validated.raw = validateJson(data.raw, 'raw', {});
    }
    logger.debug({
        bookingId: validated.bookingId,
        validatedFields: {
            monetary: ['totalCharges', 'totalPayments', 'balance', 'basePrice'],
            dates: ['arrivalDate', 'departureDate', 'bookingDate', 'modifiedDate'],
            contact: ['phone', 'email'],
            json: ['charges', 'payments', 'messages', 'infoItems', 'raw']
        }
    }, 'Booking data validation completed');
    return validated;
}
export function isValidBooking(data) {
    const errors = [];
    if (!data.bookingId) {
        errors.push('Missing bookingId');
    }
    if (!data.arrivalDate) {
        errors.push('Missing or invalid arrivalDate');
    }
    if (!data.departureDate) {
        errors.push('Missing or invalid departureDate');
    }
    if (data.arrivalDate && data.departureDate) {
        const arrival = new Date(data.arrivalDate);
        const departure = new Date(data.departureDate);
        if (arrival >= departure) {
            errors.push('Arrival date must be before departure date');
        }
    }
    const totalCharges = parseFloat(data.totalCharges || '0');
    const totalPayments = parseFloat(data.totalPayments || '0');
    const balance = parseFloat(data.balance || '0');
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
