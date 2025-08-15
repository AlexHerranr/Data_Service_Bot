import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { redis } from '../infra/redis/redis.client.js';

export class Beds24Client {
  private api: AxiosInstance;
  private writeRefreshToken: string | null = null;
  private isInitialized: boolean = false;
  
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

  /**
   * Inicializar cliente con auth persistente
   * 1. Intentar cargar refresh token de Redis
   * 2. Si no existe y invite está habilitado, generar nuevo
   * 3. Guardar en Redis por 25 días
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('Beds24 client already initialized');
      return;
    }

    try {
      const redisKey = 'beds24:write:refresh_token';
      
      // PASO 1: Intentar cargar token de Redis
      const cachedToken = await redis.get(redisKey);
      
      if (cachedToken) {
        logger.info('🔄 Using cached Beds24 refresh token from Redis');
        this.writeRefreshToken = cachedToken;
        this.isInitialized = true;
        
        logger.info({
          tokenLength: this.writeRefreshToken?.length,
          source: 'redis-cache'
        }, '✅ Beds24 write token loaded from cache');
        return;
      }

      // PASO 2: Token no existe, verificar si podemos generar uno nuevo
      const inviteEnabled = env.BEDS24_INVITE_ENABLED === 'true';
      
      if (!inviteEnabled) {
        throw new Error('No cached refresh token and invite generation disabled. Set BEDS24_INVITE_ENABLED=true or provide valid cached token.');
      }

      if (!env.BEDS24_INVITE_CODE_WRITE) {
        throw new Error('BEDS24_INVITE_CODE_WRITE not configured for write operations');
      }

      logger.info('🚀 Generating new Beds24 refresh token from Railway IP');
      
      // PASO 3: Generar refresh token usando invite code desde IP actual de Railway
      const setupResponse = await axios.get(`${env.BEDS24_API_URL}/authentication/setup`, {
        headers: { 
          'code': env.BEDS24_INVITE_CODE_WRITE,
          'deviceName': 'Railway-Production-Auto'
        }
      });

      this.writeRefreshToken = setupResponse.data.refreshToken;
      
      // PASO 4: Guardar en Redis por 25 días (renovar antes de los 30)
      const ttlDays = 25;
      const ttlSeconds = ttlDays * 24 * 60 * 60;
      if (this.writeRefreshToken) {
        await redis.setex(redisKey, ttlSeconds, this.writeRefreshToken);
      }
      
      this.isInitialized = true;

      logger.info({
        tokenLength: this.writeRefreshToken?.length,
        expiresIn: setupResponse.data.expiresIn,
        cachedForDays: ttlDays,
        source: 'new-generation'
      }, '✅ Beds24 write token generated and cached successfully');

    } catch (error: any) {
      logger.error({ 
        error: error.message,
        response: error.response?.data 
      }, '❌ Failed to initialize Beds24 write token');
      throw error;
    }
  }

  /**
   * Verificar que el cliente esté inicializado para operaciones WRITE
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.writeRefreshToken) {
      throw new Error('Beds24 client not initialized. Call initialize() first.');
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
   * Crear o actualizar reservas (Beds24 usa solo POST para ambos)
   * Si el objeto tiene "id" es update, si no lo tiene es create
   * 
   * NUEVA ESTRATEGIA: Auth en startup desde Railway IP
   */
  async upsertBooking(bookingData: any[] | any): Promise<any> {
    try {
      // Verificar que el cliente esté inicializado
      this.ensureInitialized();
      
      // Ensure bookingData is an array as expected by Beds24 API
      const bookingsArray = Array.isArray(bookingData) ? bookingData : [bookingData];
      
      const createCount = bookingsArray.filter(b => !b.id).length;
      const updateCount = bookingsArray.filter(b => b.id).length;
      
      logger.info({ 
        bookings: bookingsArray.length,
        creates: createCount,
        updates: updateCount 
      }, 'Upserting booking(s) via POST /bookings');

      // Usar refresh token generado en startup desde Railway IP
      logger.debug('Refreshing access token with Railway-generated token');
      
      const refreshResponse = await axios.get(`${env.BEDS24_API_URL}/authentication/token`, {
        headers: { 'refreshToken': this.writeRefreshToken }
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