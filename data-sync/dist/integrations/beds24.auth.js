import axios from 'axios';
import { logger } from '../utils/logger.js';
export class Beds24Auth {
    authApi;
    constructor() {
        this.authApi = axios.create({
            baseURL: 'https://api.beds24.com/v2/authentication',
            timeout: 10000,
        });
    }
    async setup(inviteCode, deviceName = 'BotDataService-ReadWrite') {
        try {
            logger.info({ deviceName }, 'Setting up Beds24 authentication');
            const response = await this.authApi.get('/setup', {
                headers: {
                    code: inviteCode,
                    deviceName: deviceName,
                },
            });
            logger.info({
                hasRefreshToken: !!response.data.refreshToken,
                expiresIn: response.data.expiresIn
            }, 'Beds24 auth setup successful');
            return response.data;
        }
        catch (error) {
            logger.error({
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            }, 'Failed to setup Beds24 authentication');
            throw error;
        }
    }
    async refreshToken(refreshToken) {
        try {
            logger.debug('Refreshing Beds24 access token');
            const response = await this.authApi.get('/token', {
                headers: {
                    refreshToken: refreshToken,
                },
            });
            logger.info({
                expiresIn: response.data.expiresIn
            }, 'Beds24 token refreshed successfully');
            return response.data;
        }
        catch (error) {
            logger.error({
                error: error.message,
                status: error.response?.status
            }, 'Failed to refresh Beds24 token');
            throw error;
        }
    }
    async getTokenDetails(token) {
        try {
            const response = await this.authApi.get('/details', {
                headers: {
                    token: token,
                },
            });
            return response.data;
        }
        catch (error) {
            logger.error({
                error: error.message,
                status: error.response?.status
            }, 'Failed to get Beds24 token details');
            throw error;
        }
    }
    async revokeRefreshToken(refreshToken) {
        try {
            await this.authApi.delete('/token', {
                headers: {
                    refreshToken: refreshToken,
                },
            });
            logger.info('Beds24 refresh token revoked successfully');
        }
        catch (error) {
            logger.error({
                error: error.message
            }, 'Failed to revoke Beds24 refresh token');
            throw error;
        }
    }
}
export const beds24Auth = new Beds24Auth();
