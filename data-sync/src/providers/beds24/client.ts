import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export interface Beds24ApiResponse<T = any> {
  success: boolean;
  type?: string;
  count?: number;
  pages?: {
    nextPageExists: boolean;
    nextPageLink: string;
  };
  data?: T[];
  code?: number;
  error?: string;
  validToken?: boolean;
}

export class Beds24Error extends Error {
  constructor(
    message: string,
    public code?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'Beds24Error';
  }
}

class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number = 100; // Per minute
  private readonly windowMs: number = 60 * 1000; // 1 minute

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // Remove requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest) + 100; // Add small buffer
      
      logger.debug({ waitTime }, 'Rate limit reached, waiting...');
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Clean up again after waiting
      this.requests = this.requests.filter(time => Date.now() - time < this.windowMs);
    }
    
    this.requests.push(now);
  }
}

export class Beds24Client {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;

  constructor() {
    this.rateLimiter = new RateLimiter();
    
    this.client = axios.create({
      baseURL: env.BEDS24_API_URL,
      timeout: 30000, // 30 seconds
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': env.BEDS24_TOKEN
      }
    });

    // Request interceptor for rate limiting and logging
    this.client.interceptors.request.use(
      async (config) => {
        await this.rateLimiter.waitIfNeeded();
        
        logger.debug({
          method: config.method?.toUpperCase(),
          url: config.url,
          params: config.params,
        }, 'Beds24 API Request');
        
        return config;
      },
      (error) => {
        logger.error({ error: error.message }, 'Request interceptor error');
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug({
          status: response.status,
          url: response.config.url,
          dataCount: response.data?.data?.length || 0,
          success: response.data?.success,
        }, 'Beds24 API Response');
        
        return response;
      },
      (error) => {
        logger.error({
          status: error.response?.status,
          message: error.response?.data?.error || error.message,
          url: error.config?.url,
        }, 'Beds24 API Error');
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make a request with automatic retry logic
   */
  private async requestWithRetry<T>(
    config: AxiosRequestConfig,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<AxiosResponse<Beds24ApiResponse<T>>> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.request(config);
        
        if (!response.data.success) {
          throw new Beds24Error(
            response.data.error || 'API request failed',
            response.data.code,
            response.data
          );
        }
        
        return response;
      } catch (error: any) {
        lastError = error;
        
        logger.warn({
          attempt,
          maxRetries,
          error: error.message,
          url: config.url,
        }, 'Request failed, retrying...');

        if (attempt < maxRetries) {
          // Exponential backoff with jitter
          const delay = retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get bookings from Beds24 API
   */
  async getBookings(params: {
    modifiedSince?: string;
    includeInvoice?: boolean;
    includeInfoItems?: boolean;
    includeComments?: boolean;
    status?: string;
    arrivalFrom?: string;
    arrivalTo?: string;
    departureFrom?: string;
    departureTo?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    try {
      logger.info({ params }, 'Fetching bookings from Beds24');

      const response = await this.requestWithRetry({
        method: 'GET',
        url: '/bookings',
        params: {
          ...params,
          includeInvoice: params.includeInvoice ?? true,
          includeInfoItems: params.includeInfoItems ?? true,
          includeComments: params.includeComments ?? true,
        }
      });

      const bookings = response.data.data || [];
      logger.info({ count: bookings.length }, 'Successfully fetched bookings');
      
      return bookings;
    } catch (error) {
      logger.error({ error, params }, 'Failed to fetch bookings');
      throw error;
    }
  }

  /**
   * Get a single booking by ID
   */
  async getBooking(bookingId: string): Promise<any> {
    try {
      logger.debug({ bookingId }, 'Fetching single booking');

      const response = await this.requestWithRetry({
        method: 'GET',
        url: `/bookings/${bookingId}`,
        params: {
          includeInvoice: true,
          includeInfoItems: true,
          includeComments: true,
        }
      });

      return response.data.data?.[0] || null;
    } catch (error) {
      logger.error({ error, bookingId }, 'Failed to fetch booking');
      throw error;
    }
  }

  /**
   * Get cancelled/black bookings
   */
  async getCancelledBookings(params: {
    modifiedSince?: string;
    arrivalFrom?: string;
    arrivalTo?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    return this.getBookings({
      ...params,
      status: 'cancelled,black'
    });
  }

  /**
   * Get confirmed bookings (leads and confirmed)
   */
  async getConfirmedBookings(params: {
    modifiedSince?: string;
    arrivalFrom?: string;
    arrivalTo?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    return this.getBookings({
      ...params,
      status: 'new,confirmed,tentative'
    });
  }

  /**
   * Get properties information
   */
  async getProperties(): Promise<any[]> {
    try {
      logger.debug('Fetching properties');

      const response = await this.requestWithRetry({
        method: 'GET',
        url: '/properties'
      });

      const properties = response.data.data || [];
      logger.debug({ count: properties.length }, 'Fetched properties');
      
      return properties;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch properties');
      throw error;
    }
  }

  /**
   * Get rooms information
   */
  async getRooms(): Promise<any[]> {
    try {
      logger.debug('Fetching rooms');

      const response = await this.requestWithRetry({
        method: 'GET',
        url: '/properties/rooms'
      });

      const rooms = response.data.data || [];
      logger.debug({ count: rooms.length }, 'Fetched rooms');
      
      return rooms;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch rooms');
      throw error;
    }
  }

  /**
   * Validate API token and connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      logger.info('Validating Beds24 connection');

      const response = await this.requestWithRetry({
        method: 'GET',
        url: '/authentication/details'
      });

      if (response.status === 200 && response.data.validToken === true) {
        logger.info('Beds24 connection validated successfully');
        return true;
      } else {
        logger.error('Invalid Beds24 token');
        return false;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to validate Beds24 connection');
      return false;
    }
  }

  /**
   * Health check for the API
   */
  async healthCheck(): Promise<boolean> {
    try {
      const isValid = await this.validateConnection();
      if (!isValid) {
        return false;
      }

      // Try to fetch a small amount of data to ensure API is working
      await this.getBookings({ limit: 1 });
      
      logger.info('Beds24 health check passed');
      return true;
    } catch (error) {
      logger.error({ error }, 'Beds24 health check failed');
      return false;
    }
  }
}

// Singleton instance
let clientInstance: Beds24Client | null = null;

export function getBeds24Client(): Beds24Client {
  if (!clientInstance) {
    clientInstance = new Beds24Client();
  }
  return clientInstance;
}