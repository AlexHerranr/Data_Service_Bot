import { prisma } from '../../infra/db/prisma.client.js';
import { logger } from '../../utils/logger.js';
export async function mergeMessages(bookingId, newMessages) {
    try {
        const existingBooking = await prisma.booking.findUnique({
            where: { bookingId },
            select: { messages: true }
        });
        const existingMessages = existingBooking?.messages || [];
        logger.debug({
            bookingId,
            existingCount: existingMessages.length,
            newCount: newMessages.length
        }, '📨 Merging messages');
        const messageMap = new Map();
        existingMessages.forEach(msg => {
            const msgId = String(msg.id || `${msg.time}_${msg.source}`);
            messageMap.set(msgId, msg);
        });
        newMessages.forEach(msg => {
            const msgId = String(msg.id || `${msg.time}_${msg.source}`);
            if (messageMap.has(msgId)) {
                const existing = messageMap.get(msgId);
                messageMap.set(msgId, {
                    ...existing,
                    read: msg.read ?? existing.read
                });
            }
            else {
                messageMap.set(msgId, msg);
            }
        });
        const mergedMessages = Array.from(messageMap.values()).sort((a, b) => {
            const timeA = new Date(a.time).getTime();
            const timeB = new Date(b.time).getTime();
            return timeA - timeB;
        });
        logger.info({
            bookingId,
            previousCount: existingMessages.length,
            newCount: newMessages.length,
            finalCount: mergedMessages.length,
            preserved: mergedMessages.length - newMessages.length
        }, '✅ Messages merged successfully');
        return mergedMessages;
    }
    catch (error) {
        logger.error({
            bookingId,
            error: error.message
        }, '❌ Error merging messages');
        return newMessages;
    }
}
export async function hasNewMessages(bookingId, incomingMessages) {
    try {
        const existingBooking = await prisma.booking.findUnique({
            where: { bookingId },
            select: { messages: true }
        });
        const existingMessages = existingBooking?.messages || [];
        const existingIds = new Set(existingMessages.map(m => String(m.id)));
        const hasNew = incomingMessages.some(msg => !existingIds.has(String(msg.id)));
        logger.debug({
            bookingId,
            hasNew,
            existingCount: existingMessages.length,
            incomingCount: incomingMessages.length
        }, 'Checking for new messages');
        return hasNew;
    }
    catch (error) {
        logger.error({
            bookingId,
            error: error.message
        }, 'Error checking for new messages');
        return true;
    }
}
export function extractMessagesFromPayload(bookingData) {
    if (bookingData.messages && Array.isArray(bookingData.messages)) {
        return bookingData.messages.map((msg) => ({
            id: msg.id || `${msg.time}_${msg.source}`,
            message: msg.message || '',
            time: msg.time || new Date().toISOString(),
            source: msg.source || 'unknown',
            read: msg.read ?? false,
        }));
    }
    return [];
}
export async function getMessageStats(bookingId) {
    try {
        const booking = await prisma.booking.findUnique({
            where: { bookingId },
            select: { messages: true }
        });
        const messages = booking?.messages || [];
        if (messages.length === 0) {
            return {
                total: 0,
                unread: 0,
                sources: {}
            };
        }
        const unread = messages.filter(m => !m.read).length;
        const sources = {};
        messages.forEach(msg => {
            sources[msg.source] = (sources[msg.source] || 0) + 1;
        });
        const times = messages
            .map(m => new Date(m.time).getTime())
            .filter(t => !isNaN(t));
        return {
            total: messages.length,
            unread,
            sources,
            oldestMessage: times.length > 0 ? new Date(Math.min(...times)) : undefined,
            newestMessage: times.length > 0 ? new Date(Math.max(...times)) : undefined
        };
    }
    catch (error) {
        logger.error({ bookingId, error: error.message }, 'Error getting message stats');
        return {
            total: 0,
            unread: 0,
            sources: {}
        };
    }
}
