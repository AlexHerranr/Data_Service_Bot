import { logger } from '../../utils/logger.js';
export function parseDate(dateStr) {
    if (!dateStr)
        return null;
    try {
        if (dateStr.includes('T')) {
            return new Date(dateStr);
        }
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return new Date(dateStr + 'T00:00:00Z');
        }
        return new Date(dateStr);
    }
    catch (error) {
        logger.warn({ dateStr, error }, 'Failed to parse date');
        return null;
    }
}
export function formatDateSimple(date) {
    if (!date)
        return null;
    try {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dateObj.toISOString().split('T')[0];
    }
    catch (error) {
        logger.warn({ date, error }, 'Failed to format date');
        return null;
    }
}
export function sumMoney(amounts) {
    return amounts.reduce((total, amount) => {
        if (!amount)
            return total;
        const num = typeof amount === 'string' ? parseFloat(amount) : amount;
        return total + (isNaN(num) ? 0 : num);
    }, 0);
}
export function sanitizeAmount(amount) {
    if (!amount && amount !== 0)
        return 0;
    if (typeof amount === 'number')
        return amount;
    const cleaned = amount.toString().replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}
export function extractChargesAndPayments(bookingData) {
    const charges = [];
    const payments = [];
    if (bookingData.invoice && Array.isArray(bookingData.invoice)) {
        bookingData.invoice.forEach((item) => {
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
    if (bookingData.payment && Array.isArray(bookingData.payment)) {
        bookingData.payment.forEach((item) => {
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
export function extractInfoItems(bookingData) {
    const infoItems = [];
    if (bookingData.customfield && Array.isArray(bookingData.customfield)) {
        bookingData.customfield.forEach((field) => {
            if (field.value && field.value.trim()) {
                infoItems.push({
                    type: 'customfield',
                    value: field.value,
                    label: field.name || field.label
                });
            }
        });
    }
    if (bookingData.specialrequest) {
        infoItems.push({
            type: 'specialrequest',
            value: bookingData.specialrequest
        });
    }
    if (bookingData.comments) {
        infoItems.push({
            type: 'comments',
            value: bookingData.comments
        });
    }
    if (bookingData.guestNotes) {
        infoItems.push({
            type: 'guestNotes',
            value: bookingData.guestNotes
        });
    }
    return infoItems;
}
export function calculateNights(arrivalDate, departureDate) {
    if (!arrivalDate || !departureDate)
        return 0;
    try {
        const arrival = new Date(arrivalDate);
        const departure = new Date(departureDate);
        const diffTime = departure.getTime() - arrival.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays);
    }
    catch (error) {
        logger.warn({ arrivalDate, departureDate, error }, 'Failed to calculate nights');
        return 0;
    }
}
export function determineBDStatus(bookingData) {
    const status = bookingData.status?.toLowerCase();
    if (!status)
        return null;
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
export function shouldSyncAsLead(bookingData) {
    const bdStatus = determineBDStatus(bookingData);
    return bdStatus === 'Futura Pendiente';
}
export function shouldSyncAsConfirmed(bookingData) {
    const bdStatus = determineBDStatus(bookingData);
    return bdStatus === 'Futura Confirmada';
}
export function isCancelledBooking(bookingData) {
    const bdStatus = determineBDStatus(bookingData);
    return bdStatus === 'Cancelada';
}
export function extractGuestName(bookingData) {
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
    if (bookingData.reference) {
        return bookingData.reference;
    }
    if (bookingData.invoiceeId) {
        return `Guest ${bookingData.invoiceeId}`;
    }
    return null;
}
export function extractPhoneNumber(bookingData) {
    if (bookingData.phone) {
        return cleanPhoneNumber(bookingData.phone);
    }
    if (bookingData.guestPhone) {
        return cleanPhoneNumber(bookingData.guestPhone);
    }
    if (bookingData.apiReference) {
        const phoneFromApi = extractPhoneFromApiReference(bookingData.apiReference);
        if (phoneFromApi) {
            return phoneFromApi;
        }
    }
    const phoneFromNotes = extractPhoneFromText(`${bookingData.comments || ''} ${bookingData.notes || ''}`);
    if (phoneFromNotes) {
        return phoneFromNotes;
    }
    return null;
}
export function extractEmail(bookingData) {
    if (bookingData.email) {
        return bookingData.email;
    }
    if (bookingData.guestEmail) {
        return bookingData.guestEmail;
    }
    const emailFromText = extractEmailFromText(`${bookingData.comments || ''} ${bookingData.notes || ''}`);
    return emailFromText;
}
export function combineNotes(bookingData) {
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
    if (bookingData.channel || bookingData.referer) {
        notes.push(`Source: ${bookingData.channel || bookingData.referer}`);
    }
    return notes.length > 0 ? notes.join(' | ') : null;
}
export function calculateTotalPersons(bookingData) {
    const adults = parseInt(bookingData.numAdult || bookingData.adults || '0') || 0;
    const children = parseInt(bookingData.numChild || bookingData.children || '0') || 0;
    const total = adults + children;
    return total > 0 ? total : null;
}
export function determineChannel(bookingData) {
    if (bookingData.channel) {
        return bookingData.channel;
    }
    if (bookingData.referer) {
        return bookingData.referer;
    }
    if (bookingData.source) {
        return bookingData.source;
    }
    if (bookingData.apiSourceId || bookingData.apiSource) {
        return mapApiSourceToChannel(bookingData.apiSourceId, bookingData.apiSource);
    }
    return null;
}
export function extractMessages(bookingData) {
    if (bookingData.messages && Array.isArray(bookingData.messages)) {
        return bookingData.messages.map((msg) => ({
            id: msg.id,
            message: msg.message,
            time: msg.time,
            source: msg.source,
            read: msg.read || false,
        }));
    }
    return [];
}
export function mapPropertyName(propertyId) {
    const propertyMap = {
        '1': 'Property 1',
        '2': 'Property 2',
    };
    return propertyMap[String(propertyId)] || null;
}
function cleanPhoneNumber(phone) {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+')) {
        return `+${cleaned}`;
    }
    return cleaned;
}
function extractPhoneFromApiReference(apiRef) {
    const phoneMatch = apiRef.match(/(\+?\d{10,15})/);
    return phoneMatch ? cleanPhoneNumber(phoneMatch[1]) : null;
}
function extractPhoneFromText(text) {
    const phonePattern = /(\+?\d{1,4}[\s-]?\d{10,15})/;
    const match = text.match(phonePattern);
    return match ? cleanPhoneNumber(match[1]) : null;
}
function extractEmailFromText(text) {
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const match = text.match(emailPattern);
    return match ? match[0] : null;
}
function mapApiSourceToChannel(apiSourceId, apiSource) {
    const sourceMap = {
        1: 'Booking.com',
        2: 'Airbnb',
        3: 'Expedia',
        4: 'Direct',
    };
    return sourceMap[apiSourceId] || apiSource || 'Unknown';
}
