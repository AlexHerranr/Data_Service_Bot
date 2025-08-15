import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { beds24Auth } from './beds24.auth.js';
import { redis } from '../infra/redis/redis.client.js';

interface Beds24RequestConfig {
  requireWrite?: boolean;
}

export class Beds24Client {
  private api: AxiosInstance;
  private readonly CACHE_PREFIX = 'beds24:tokens:';
  
  constructor() {
    this.api = axios.create({
      baseURL: env.BEDS24_API_URL,
      timeout: 15000,
    });

    // Interceptor para manejo automático de tokens
    this.api.interceptors.request.use(async (config) => {
      const requireWrite = (config as any).requireWrite || false;
      const token = await this.getValidToken(requireWrite);
      
      config.headers = config.headers || {};
      config.headers['token'] = token;
      
      return config;
    });
  }

  /**
   * Obtener token válido (read o write según necesidad)
   */
  private async getValidToken(requireWrite = false): Promise<string> {
    try {
      if (requireWrite) {
        // Para operaciones WRITE, usar refresh token system
        const refreshToken = env.BEDS24_WRITE_REFRESH_TOKEN;
        
        if (!refreshToken) {
          throw new Error('No write refresh token available for write operations');
        }

        const tokenType = 'write';
        const cacheKey = `${this.CACHE_PREFIX}${tokenType}`;
        const expiresKey = `${this.CACHE_PREFIX}${tokenType}:expires`;

        // Verificar cache
        const cachedToken = await redis.get(cacheKey);
        const expiresAtStr = await redis.get(expiresKey);
        
        if (cachedToken && expiresAtStr && Date.now() < parseInt(expiresAtStr)) {
          logger.debug({ tokenType }, 'Using cached Beds24 write token');
          return cachedToken;
        }

        // Refresh access token
        logger.info({ tokenType }, 'Refreshing Beds24 write token');
        const tokenResponse = await beds24Auth.refreshToken(refreshToken);
        
        // Cache con buffer de 1 minuto
        const tokenExpiresAt = Date.now() + (tokenResponse.expiresIn * 1000) - (60 * 1000);
        await redis.setex(cacheKey, tokenResponse.expiresIn - 60, tokenResponse.token);
        await redis.set(expiresKey, tokenExpiresAt.toString());

        logger.info({ 
          tokenType, 
          expiresIn: tokenResponse.expiresIn 
        }, 'Beds24 write token refreshed and cached');

        return tokenResponse.token;
      } else {
        // Para operaciones READ, usar long life token (legacy)
        logger.debug('Using long life token for read operations');
        return env.BEDS24_TOKEN;
      }
    } catch (error: any) {
      logger.error({ 
        error: error.message, 
        requireWrite 
      }, 'Failed to get valid Beds24 token');
      throw error;
    }
  }

  /**
   * Verificar scopes del token actual
   */
  async verifyTokenScopes(requireWrite = false): Promise<{ valid: boolean; scopes: string[] }> {
    try {
      const token = await this.getValidToken(requireWrite);
      const details = await beds24Auth.getTokenDetails(token);
      
      const requiredScopes = requireWrite 
        ? ['write:bookings', 'all:bookings'] 
        : ['read:bookings'];
      
      const hasRequiredScopes = requiredScopes.some(scope => 
        details.token.scopes.includes(scope)
      );

      return {
        valid: details.validToken && hasRequiredScopes,
        scopes: details.token.scopes
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to verify token scopes');
      return { valid: false, scopes: [] };
    }
  }

  // ========== READ OPERATIONS (usar read token) ==========

  /**
   * Obtener reservas
   */
  async getBookings(params: any = {}): Promise<any> {
    try {
      const response = await this.api.get('/bookings', { 
        params,
        requireWrite: false 
      } as any);
      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message, params }, 'Failed to get bookings');
      throw error;
    }
  }

  /**
   * Obtener reserva específica por ID
   */
  async getBooking(bookingId: string): Promise<any> {
    try {
      const response = await this.api.get(`/bookings/${bookingId}`, { 
        requireWrite: false 
      } as any);
      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message, bookingId }, 'Failed to get booking');
      throw error;
    }
  }

  /**
   * Obtener propiedades
   */
  async getProperties(): Promise<any> {
    try {
      const response = await this.api.get('/properties', { 
        requireWrite: false 
      } as any);
      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get properties');
      throw error;
    }
  }

  /**
   * Obtener disponibilidad
   */
  async getAvailability(params: any = {}): Promise<any> {
    try {
      const response = await this.api.get('/inventory/rooms/availability', { 
        params,
        requireWrite: false 
      } as any);
      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message, params }, 'Failed to get availability');
      throw error;
    }
  }

  /**
   * Obtener mensajes de reservas
   */
  async getBookingMessages(params: any = {}): Promise<any> {
    try {
      const response = await this.api.get('/bookings/messages', { 
        params,
        requireWrite: false 
      } as any);
      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message, params }, 'Failed to get booking messages');
      throw error;
    }
  }

  // ========== WRITE OPERATIONS (usar write token) ==========

  /**
   * Actualizar reserva
   */
  async updateBooking(bookingId: string, updateData: any): Promise<any> {
    try {
      logger.info({ bookingId, updateData }, 'Updating booking');
      
      const response = await this.api.patch(`/bookings/${bookingId}`, updateData, {
        requireWrite: true
      } as any);
      
      return response.data;
    } catch (error: any) {
      logger.error({ 
        error: error.message, 
        bookingId, 
        updateData 
      }, 'Failed to update booking');
      throw error;
    }
  }

  /**
   * Crear nueva reserva
   */
  async createBooking(bookingData: any): Promise<any> {
    try {
      logger.info({ bookingData }, 'Creating new booking');
      
      const response = await this.api.post('/bookings', bookingData, {
        requireWrite: true
      } as any);
      
      return response.data;
    } catch (error: any) {
      logger.error({ 
        error: error.message, 
        bookingData 
      }, 'Failed to create booking');
      throw error;
    }
  }

  /**
   * Cancelar reserva (cambiar status)
   */
  async cancelBooking(bookingId: string, reason?: string): Promise<any> {
    try {
      logger.info({ bookingId, reason }, 'Cancelling booking');
      
      const updateData = {
        status: 'cancelled',
        ...(reason && { notes: reason })
      };
      
      return await this.updateBooking(bookingId, updateData);
    } catch (error: any) {
      logger.error({ 
        error: error.message, 
        bookingId 
      }, 'Failed to cancel booking');
      throw error;
    }
  }

  /**
   * Actualizar precios/inventory
   */
  async updateInventory(propertyId: string, inventoryData: any): Promise<any> {
    try {
      logger.info({ propertyId, inventoryData }, 'Updating inventory');
      
      const response = await this.api.patch(`/inventory/${propertyId}`, inventoryData, {
        requireWrite: true
      } as any);
      
      return response.data;
    } catch (error: any) {
      logger.error({ 
        error: error.message, 
        propertyId, 
        inventoryData 
      }, 'Failed to update inventory');
      throw error;
    }
  }
}

export const beds24Client = new Beds24Client();