import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export class Beds24Client {
  private api: AxiosInstance;
  
  constructor() {
    this.api = axios.create({
      baseURL: env.BEDS24_API_URL,
      timeout: 15000,
    });

    // Interceptor simplificado solo para READ operations
    this.api.interceptors.request.use(async (config) => {
      // Solo para operaciones READ, usar long-life token
      config.headers = config.headers || {};
      config.headers['token'] = env.BEDS24_TOKEN;
      return config;
    });
  }

  // Métodos simplificados - sin Redis, sin cache

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
   * Crear o actualizar reservas (Beds24 usa solo POST para ambos)
   * Si el objeto tiene "id" es update, si no lo tiene es create
   * 
   * ESTRATEGIA SIMPLIFICADA: Refresh directo sin Redis para máxima compatibilidad
   */
  async upsertBooking(bookingData: any[] | any): Promise<any> {
    try {
      // Ensure bookingData is an array as expected by Beds24 API
      const bookingsArray = Array.isArray(bookingData) ? bookingData : [bookingData];
      
      const createCount = bookingsArray.filter(b => !b.id).length;
      const updateCount = bookingsArray.filter(b => b.id).length;
      
      logger.info({ 
        bookings: bookingsArray.length,
        creates: createCount,
        updates: updateCount 
      }, 'Upserting booking(s) via POST /bookings');

      // ESTRATEGIA SIMPLIFICADA: Refresh directo sin cache Redis
      // Ideal para operaciones WRITE infrecuentes (<1/min)
      if (!env.BEDS24_WRITE_REFRESH_TOKEN) {
        throw new Error('BEDS24_WRITE_REFRESH_TOKEN not configured for write operations');
      }

      logger.debug('Refreshing access token for write operation');
      const refreshResponse = await axios.get(`${env.BEDS24_API_URL}/authentication/token`, {
        headers: { 'refreshToken': env.BEDS24_WRITE_REFRESH_TOKEN }
      });
      const accessToken = refreshResponse.data.token;
      
      // POST directo con access token fresco
      const response = await axios.post(`${env.BEDS24_API_URL}/bookings`, bookingsArray, {
        headers: { 'token': accessToken },
        timeout: 15000
      });
      
      logger.info({ 
        bookings: bookingsArray.length,
        creates: createCount,
        updates: updateCount,
        responseCount: response.data.length
      }, 'Booking upsert completed successfully');
      
      return response.data;
    } catch (error: any) {
      const bookingsArray = Array.isArray(bookingData) ? bookingData : [bookingData];
      logger.error({ 
        error: error.message, 
        bookingData: bookingsArray?.length ? `${bookingsArray.length} bookings` : 'invalid data'
      }, 'Failed to upsert booking');
      throw error;
    }
  }

  // upsertBookingSimple removido - ahora upsertBooking es simplificado

  /**
   * Crear nueva reserva (legacy method - wrapper para upsertBooking)
   */
  async createBooking(bookingData: any[] | any): Promise<any> {
    return this.upsertBooking(bookingData);
  }

  /**
   * Actualizar reserva (legacy method - wrapper para upsertBooking)
   */
  async updateBooking(bookingId: string, updateData: any): Promise<any> {
    // Agregar el ID al updateData para que sea un update
    const bookingWithId = { id: bookingId, ...updateData };
    return this.upsertBooking([bookingWithId]);
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

  /**
   * Obtener reviews de Booking.com
   */
  async getBookingReviews(): Promise<any> {
    try {
      const response = await this.api.get('/channels/booking/reviews', {
        requireWrite: false
      } as any);
      
      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get Booking.com reviews');
      throw error;
    }
  }

  /**
   * Realizar acciones en Booking.com (reportNoShow, etc.)
   */
  async performBookingActions(actions: any[]): Promise<any> {
    try {
      logger.info({ actions }, 'Performing Booking.com actions');
      
      const response = await this.api.post('/channels/booking', actions, {
        requireWrite: true
      } as any);
      
      return response.data;
    } catch (error: any) {
      logger.error({ 
        error: error.message, 
        actions 
      }, 'Failed to perform Booking.com actions');
      throw error;
    }
  }
}

export const beds24Client = new Beds24Client();