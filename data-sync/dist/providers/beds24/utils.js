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
