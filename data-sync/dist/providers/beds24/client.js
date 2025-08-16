import axios from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
export class Beds24Error extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'Beds24Error';
    }
}
class RateLimiter {
    requests = [];
    maxRequests = 100;
    windowMs = 60 * 1000;
    async waitIfNeeded() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.windowMs);
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = this.windowMs - (now - oldestRequest) + 100;
            logger.debug({ waitTime }, 'Rate limit reached, waiting...');
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this.requests = this.requests.filter(time => Date.now() - time < this.windowMs);
        }
        this.requests.push(now);
    }
}
export class Beds24Client {
    client;
    rateLimiter;
    constructor() {
        this.rateLimiter = new RateLimiter();
        this.client = axios.create({
            baseURL: env.BEDS24_API_URL,
            timeout: 30000,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'token': env.BEDS24_TOKEN
            }
        });
        this.client.interceptors.request.use(async (config) => {
            await this.rateLimiter.waitIfNeeded();
            logger.debug({
                method: config.method?.toUpperCase(),
                url: config.url,
                params: config.params,
            }, 'Beds24 API Request');
            return config;
        }, (error) => {
            logger.error({ error: error.message }, 'Request interceptor error');
            return Promise.reject(error);
        });
        this.client.interceptors.response.use((response) => {
            logger.debug({
                status: response.status,
                url: response.config.url,
                dataCount: response.data?.data?.length || 0,
                success: response.data?.success,
            }, 'Beds24 API Response');
            return response;
        }, (error) => {
            logger.error({
                status: error.response?.status,
                message: error.response?.data?.error || error.message,
                url: error.config?.url,
            }, 'Beds24 API Error');
            return Promise.reject(error);
        });
    }
    async requestWithRetry(config, maxRetries = 3, retryDelay = 1000) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.client.request(config);
                if (response.status >= 400) {
                    throw new Beds24Error(`HTTP error ${response.status}`, response.status);
                }
                if (!response.data.success) {
                    throw new Beds24Error(response.data.error || 'API request failed', response.data.code, response.data);
                }
                return response;
            }
            catch (error) {
                lastError = error;
                if (error.response?.status === 401 || error.response?.status === 403) {
                    throw new Beds24Error('Token de autenticación inválido o expirado', error.response.status);
                }
                logger.warn({
                    attempt,
                    maxRetries,
                    error: error.message,
                    url: config.url,
                }, 'Request failed, retrying...');
                if (attempt < maxRetries) {
                    const delay = retryDelay * Math.pow(2, attempt - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }
    async getBookings(params = {}) {
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
        }
        catch (error) {
            logger.error({ error, params }, 'Failed to fetch bookings');
            throw error;
        }
    }
    async getBooking(bookingId) {
        try {
            logger.debug({ bookingId }, 'Fetching single booking');
            const response = await this.requestWithRetry({
                method: 'GET',
                url: '/bookings',
                params: {
                    id: bookingId,
                    includeInvoice: true,
                    includeInfoItems: true,
                    includeComments: true,
                }
            });
            return response.data.data?.[0] || null;
        }
        catch (error) {
            logger.error({ error, bookingId }, 'Failed to fetch booking');
            throw error;
        }
    }
    async getCancelledBookings(params = {}) {
        return this.getBookings({
            ...params,
            status: 'cancelled,black'
        });
    }
    async getConfirmedBookings(params = {}) {
        return this.getBookings({
            ...params,
            status: 'new,confirmed,tentative'
        });
    }
    async getProperties() {
        try {
            logger.debug('Fetching properties');
            const response = await this.requestWithRetry({
                method: 'GET',
                url: '/properties'
            });
            const properties = response.data.data || [];
            logger.debug({ count: properties.length }, 'Fetched properties');
            return properties;
        }
        catch (error) {
            logger.error({ error }, 'Failed to fetch properties');
            throw error;
        }
    }
    async getRooms() {
        try {
            logger.debug('Fetching rooms');
            const response = await this.requestWithRetry({
                method: 'GET',
                url: '/properties/rooms'
            });
            const rooms = response.data.data || [];
            logger.debug({ count: rooms.length }, 'Fetched rooms');
            return rooms;
        }
        catch (error) {
            logger.error({ error }, 'Failed to fetch rooms');
            throw error;
        }
    }
    async validateConnection() {
        try {
            logger.info('Validating Beds24 connection');
            const response = await this.requestWithRetry({
                method: 'GET',
                url: '/authentication/details'
            });
            if (response.status === 200 && response.data.validToken === true) {
                logger.info('Beds24 connection validated successfully');
                return true;
            }
            else {
                logger.error('Invalid Beds24 token');
                return false;
            }
        }
        catch (error) {
            logger.error({ error }, 'Failed to validate Beds24 connection');
            return false;
        }
    }
    async healthCheck() {
        try {
            const isValid = await this.validateConnection();
            if (!isValid) {
                return false;
            }
            await this.getBookings({ limit: 1 });
            logger.info('Beds24 health check passed');
            return true;
        }
        catch (error) {
            logger.error({ error }, 'Beds24 health check failed');
            return false;
        }
    }
}
let clientInstance = null;
export function getBeds24Client() {
    if (!clientInstance) {
        clientInstance = new Beds24Client();
    }
    return clientInstance;
}
