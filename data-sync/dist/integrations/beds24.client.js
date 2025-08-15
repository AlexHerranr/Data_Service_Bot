import axios from 'axios';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { redis } from '../infra/redis/redis.client.js';
export class Beds24Client {
    api;
    writeRefreshToken = null;
    isInitialized = false;
    constructor() {
        this.api = axios.create({
            baseURL: env.BEDS24_API_URL,
            timeout: 15000,
        });
        this.api.interceptors.request.use(async (config) => {
            config.headers = config.headers || {};
            config.headers['token'] = env.BEDS24_TOKEN;
            return config;
        });
    }
    async initialize() {
        if (this.isInitialized) {
            logger.debug('Beds24 client already initialized');
            return;
        }
        try {
            const redisKey = 'beds24:write:refresh_token';
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
            const inviteEnabled = env.BEDS24_INVITE_ENABLED === 'true';
            if (!inviteEnabled) {
                throw new Error('No cached refresh token and invite generation disabled. Set BEDS24_INVITE_ENABLED=true or provide valid cached token.');
            }
            if (!env.BEDS24_INVITE_CODE_WRITE) {
                throw new Error('BEDS24_INVITE_CODE_WRITE not configured for write operations');
            }
            logger.info('🚀 Generating new Beds24 refresh token from Railway IP');
            const setupResponse = await axios.get(`${env.BEDS24_API_URL}/authentication/setup`, {
                headers: {
                    'code': env.BEDS24_INVITE_CODE_WRITE,
                    'deviceName': 'Railway-Production-Auto'
                }
            });
            this.writeRefreshToken = setupResponse.data.refreshToken;
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
        }
        catch (error) {
            logger.error({
                error: error.message,
                response: error.response?.data
            }, '❌ Failed to initialize Beds24 write token');
            throw error;
        }
    }
    ensureInitialized() {
        if (!this.isInitialized || !this.writeRefreshToken) {
            throw new Error('Beds24 client not initialized. Call initialize() first.');
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
            this.ensureInitialized();
            const bookingsArray = Array.isArray(bookingData) ? bookingData : [bookingData];
            const createCount = bookingsArray.filter(b => !b.id).length;
            const updateCount = bookingsArray.filter(b => b.id).length;
            logger.info({
                bookings: bookingsArray.length,
                creates: createCount,
                updates: updateCount
            }, 'Upserting booking(s) via POST /bookings');
            logger.debug('Refreshing access token with Railway-generated token');
            const refreshResponse = await axios.get(`${env.BEDS24_API_URL}/authentication/token`, {
                headers: { 'refreshToken': this.writeRefreshToken }
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
