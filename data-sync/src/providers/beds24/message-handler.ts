/**
 * Manejo inteligente de mensajes para preservar histórico
 * Beds24 solo mantiene mensajes de los últimos 3 días
 * Este módulo preserva mensajes antiguos y agrega nuevos
 */

import { prisma } from '../../infra/db/prisma.client.js';
import { logger } from '../../utils/logger.js';

interface Message {
  id: string | number;
  message: string;
  time: string;
  source: string;
  read?: boolean;
}

/**
 * Combina mensajes existentes con nuevos, evitando duplicados
 * y preservando el histórico completo
 */
export async function mergeMessages(
  bookingId: string, 
  newMessages: Message[]
): Promise<Message[]> {
  try {
    // Obtener mensajes existentes de la BD
    const existingBooking = await prisma.booking.findUnique({
      where: { bookingId },
      select: { messages: true }
    });

    const existingMessages = (existingBooking?.messages as any as Message[]) || [];
    
    logger.debug({ 
      bookingId, 
      existingCount: existingMessages.length,
      newCount: newMessages.length 
    }, '📨 Merging messages');

    // Crear un Map para evitar duplicados por ID
    const messageMap = new Map<string, Message>();
    
    // Primero agregar mensajes existentes (preservar histórico)
    existingMessages.forEach(msg => {
      const msgId = String(msg.id || `${msg.time}_${msg.source}`);
      messageMap.set(msgId, msg);
    });

    // Luego agregar/actualizar con mensajes nuevos
    newMessages.forEach(msg => {
      const msgId = String(msg.id || `${msg.time}_${msg.source}`);
      // Si el mensaje ya existe, actualizar solo el estado 'read'
      if (messageMap.has(msgId)) {
        const existing = messageMap.get(msgId)!;
        messageMap.set(msgId, {
          ...existing,
          read: msg.read ?? existing.read
        });
      } else {
        // Mensaje nuevo, agregarlo
        messageMap.set(msgId, msg);
      }
    });

    // Convertir de vuelta a array y ordenar por tiempo
    const mergedMessages = Array.from(messageMap.values()).sort((a, b) => {
      const timeA = new Date(a.time).getTime();
      const timeB = new Date(b.time).getTime();
      return timeA - timeB; // Orden cronológico
    });

    logger.info({ 
      bookingId,
      previousCount: existingMessages.length,
      newCount: newMessages.length,
      finalCount: mergedMessages.length,
      preserved: mergedMessages.length - newMessages.length
    }, '✅ Messages merged successfully');

    return mergedMessages;

  } catch (error: any) {
    logger.error({ 
      bookingId, 
      error: error.message 
    }, '❌ Error merging messages');
    
    // En caso de error, al menos retornar los mensajes nuevos
    return newMessages;
  }
}

/**
 * Detecta si hay mensajes nuevos comparando con los existentes
 */
export async function hasNewMessages(
  bookingId: string,
  incomingMessages: Message[]
): Promise<boolean> {
  try {
    const existingBooking = await prisma.booking.findUnique({
      where: { bookingId },
      select: { messages: true }
    });

    const existingMessages = (existingBooking?.messages as any as Message[]) || [];
    const existingIds = new Set(existingMessages.map(m => String(m.id)));
    
    // Verificar si hay algún mensaje nuevo
    const hasNew = incomingMessages.some(msg => 
      !existingIds.has(String(msg.id))
    );

    logger.debug({ 
      bookingId, 
      hasNew,
      existingCount: existingMessages.length,
      incomingCount: incomingMessages.length
    }, 'Checking for new messages');

    return hasNew;

  } catch (error: any) {
    logger.error({ 
      bookingId, 
      error: error.message 
    }, 'Error checking for new messages');
    
    // En caso de error, asumir que hay mensajes nuevos
    return true;
  }
}

/**
 * Extrae y formatea mensajes del payload de Beds24
 */
export function extractMessagesFromPayload(bookingData: any): Message[] {
  if (bookingData.messages && Array.isArray(bookingData.messages)) {
    return bookingData.messages.map((msg: any) => ({
      id: msg.id || `${msg.time}_${msg.source}`,
      message: msg.message || '',
      time: msg.time || new Date().toISOString(),
      source: msg.source || 'unknown',
      read: msg.read ?? false,
    }));
  }
  
  return [];
}

/**
 * Obtiene estadísticas de mensajes
 */
export async function getMessageStats(bookingId: string): Promise<{
  total: number;
  unread: number;
  sources: Record<string, number>;
  oldestMessage?: Date;
  newestMessage?: Date;
}> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      select: { messages: true }
    });

    const messages = (booking?.messages as any as Message[]) || [];
    
    if (messages.length === 0) {
      return {
        total: 0,
        unread: 0,
        sources: {}
      };
    }

    const unread = messages.filter(m => !m.read).length;
    const sources: Record<string, number> = {};
    
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

  } catch (error: any) {
    logger.error({ bookingId, error: error.message }, 'Error getting message stats');
    return {
      total: 0,
      unread: 0,
      sources: {}
    };
  }
}