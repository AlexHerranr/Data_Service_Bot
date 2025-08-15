import axios from 'axios';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { beds24Auth } from './beds24.auth.js';
import { redis } from '../infra/redis/redis.client.js';
export class Beds24Client {
    api;
    CACHE_PREFIX = 'beds24:tokens:';
    constructor() {
        this.api = axios.create({
            baseURL: env.BEDS24_API_URL,
            timeout: 15000,
        });
        this.api.interceptors.request.use(async (config) => {
            const requireWrite = config.requireWrite || false;
            const token = await this.getValidToken(requireWrite);
            config.headers = config.headers || {};
            config.headers['token'] = token;
            return config;
        });
    }
    async getValidToken(requireWrite = false) {
        try {
            if (requireWrite) {
                const refreshToken = env.BEDS24_WRITE_REFRESH_TOKEN;
                if (!refreshToken) {
                    throw new Error('No write refresh token available for write operations');
                }
                const tokenType = 'write';
                const cacheKey = `${this.CACHE_PREFIX}${tokenType}`;
                const expiresKey = `${this.CACHE_PREFIX}${tokenType}:expires`;
                const cachedToken = await redis.get(cacheKey);
                const expiresAtStr = await redis.get(expiresKey);
                if (cachedToken && expiresAtStr && Date.now() < parseInt(expiresAtStr)) {
                    logger.debug({ tokenType }, 'Using cached Beds24 write token');
                    return cachedToken;
                }
                logger.info({ tokenType }, 'Refreshing Beds24 write token');
                const tokenResponse = await beds24Auth.refreshToken(refreshToken);
                const tokenExpiresAt = Date.now() + (tokenResponse.expiresIn * 1000) - (60 * 1000);
                await redis.setex(cacheKey, tokenResponse.expiresIn - 60, tokenResponse.token);
                await redis.set(expiresKey, tokenExpiresAt.toString());
                logger.info({
                    tokenType,
                    expiresIn: tokenResponse.expiresIn
                }, 'Beds24 write token refreshed and cached');
                return tokenResponse.token;
            }
            else {
                logger.debug('Using long life token for read operations');
                return env.BEDS24_TOKEN;
            }
        }
        catch (error) {
            logger.error({
                error: error.message,
                requireWrite
            }, 'Failed to get valid Beds24 token');
            throw error;
        }
    }
    async verifyTokenScopes(requireWrite = false) {
        try {
            const token = await this.getValidToken(requireWrite);
            const details = await beds24Auth.getTokenDetails(token);
            const requiredScopes = requireWrite
                ? ['write:bookings', 'all:bookings']
                : ['read:bookings'];
            const hasRequiredScopes = requiredScopes.some(scope => details.token.scopes.includes(scope));
            return {
                valid: details.validToken && hasRequiredScopes,
                scopes: details.token.scopes
            };
        }
        catch (error) {
            logger.error({ error: error.message }, 'Failed to verify token scopes');
            return { valid: false, scopes: [] };
        }
    }
    async getBookings(params = {}) {
        try {
            const response = await this.api.get('/bookings', {
                params,
                requireWrite: false
            });
            return response.data;
        }
        catch (error) {
            logger.error({ error: error.message, params }, 'Failed to get bookings');
            throw error;
        }
    }
    async getBooking(bookingId) {
        try {
            const response = await this.api.get(`/bookings/${bookingId}`, {
                requireWrite: false
            });
            return response.data;
        }
        catch (error) {
            logger.error({ error: error.message, bookingId }, 'Failed to get booking');
            throw error;
        }
    }
    async getProperties() {
        try {
            const response = await this.api.get('/properties', {
                requireWrite: false
            });
            return response.data;
        }
        catch (error) {
            logger.error({ error: error.message }, 'Failed to get properties');
            throw error;
        }
    }
    async getAvailability(params = {}) {
        try {
            const response = await this.api.get('/inventory/rooms/availability', {
                params,
                requireWrite: false
            });
            return response.data;
        }
        catch (error) {
            logger.error({ error: error.message, params }, 'Failed to get availability');
            throw error;
        }
    }
    async getBookingMessages(params = {}) {
        try {
            const response = await this.api.get('/bookings/messages', {
                params,
                requireWrite: false
            });
            return response.data;
        }
        catch (error) {
            logger.error({ error: error.message, params }, 'Failed to get booking messages');
            throw error;
        }
    }
    async upsertBooking(bookingData) {
        try {
            const bookingsArray = Array.isArray(bookingData) ? bookingData : [bookingData];
            const createCount = bookingsArray.filter(b => !b.id).length;
            const updateCount = bookingsArray.filter(b => b.id).length;
            logger.info({
                bookings: bookingsArray.length,
                creates: createCount,
                updates: updateCount
            }, 'Upserting booking(s) via POST /bookings');
            if (!env.BEDS24_WRITE_REFRESH_TOKEN) {
                throw new Error('BEDS24_WRITE_REFRESH_TOKEN not configured for write operations');
            }
            logger.debug('Refreshing access token for write operation');
            const refreshResponse = await axios.get(`${env.BEDS24_API_URL}/authentication/token`, {
                headers: { 'refreshToken': env.BEDS24_WRITE_REFRESH_TOKEN }
            });
            const accessToken = refreshResponse.data.token;
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
        }
        catch (error) {
            const bookingsArray = Array.isArray(bookingData) ? bookingData : [bookingData];
            logger.error({
                error: error.message,
                bookingData: bookingsArray?.length ? `${bookingsArray.length} bookings` : 'invalid data'
            }, 'Failed to upsert booking');
            throw error;
        }
    }
    async upsertBookingSimple(bookingData) {
        try {
            const bookingsArray = Array.isArray(bookingData) ? bookingData : [bookingData];
            logger.info({ bookings: bookingsArray.length }, 'Testing upsert booking (local)');
            const refreshResponse = await axios.get(`${env.BEDS24_API_URL}/authentication/token`, {
                headers: { 'refreshToken': env.BEDS24_WRITE_REFRESH_TOKEN }
            });
            const accessToken = refreshResponse.data.token;
            const response = await axios.post(`${env.BEDS24_API_URL}/bookings`, bookingsArray, {
                headers: { 'token': accessToken }
            });
            return response.data;
        }
        catch (error) {
            logger.error({ error: error.message }, 'Failed to upsert booking (simple)');
            throw error;
        }
    }
    async createBooking(bookingData) {
        return this.upsertBooking(bookingData);
    }
    async updateBooking(bookingId, updateData) {
        const bookingWithId = { id: bookingId, ...updateData };
        return this.upsertBooking([bookingWithId]);
    }
    async cancelBooking(bookingId, reason) {
        try {
            logger.info({ bookingId, reason }, 'Cancelling booking');
            const updateData = {
                status: 'cancelled',
                ...(reason && { notes: reason })
            };
            return await this.updateBooking(bookingId, updateData);
        }
        catch (error) {
            logger.error({
                error: error.message,
                bookingId
            }, 'Failed to cancel booking');
            throw error;
        }
    }
    async updateInventory(propertyId, inventoryData) {
        try {
            logger.info({ propertyId, inventoryData }, 'Updating inventory');
            const response = await this.api.patch(`/inventory/${propertyId}`, inventoryData, {
                requireWrite: true
            });
            return response.data;
        }
        catch (error) {
            logger.error({
                error: error.message,
                propertyId,
                inventoryData
            }, 'Failed to update inventory');
            throw error;
        }
    }
    async getBookingReviews() {
        try {
            const response = await this.api.get('/channels/booking/reviews', {
                requireWrite: false
            });
            return response.data;
        }
        catch (error) {
            logger.error({ error: error.message }, 'Failed to get Booking.com reviews');
            throw error;
        }
    }
    async performBookingActions(actions) {
        try {
            logger.info({ actions }, 'Performing Booking.com actions');
            const response = await this.api.post('/channels/booking', actions, {
                requireWrite: true
            });
            return response.data;
        }
        catch (error) {
            logger.error({
                error: error.message,
                actions
            }, 'Failed to perform Booking.com actions');
            throw error;
        }
    }
}
export const beds24Client = new Beds24Client();
