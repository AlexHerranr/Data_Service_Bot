import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

interface Beds24TokenResponse {
  token: string;
  refreshToken?: string;
  expiresIn: number;
}

interface Beds24TokenDetails {
  validToken: boolean;
  token: {
    scopes: string[];
    ownerId: string;
    deviceName: string;
    created: string;
    expires: string;
  };
  diagnostics: any;
}

export class Beds24Auth {
  private authApi: AxiosInstance;

  constructor() {
    this.authApi = axios.create({
      baseURL: 'https://api.beds24.com/v2/authentication',
      timeout: 10000,
    });
  }

  /**
   * Setup inicial con invite code para obtener refresh token
   */
  async setup(inviteCode: string, deviceName = 'BotDataService-ReadWrite'): Promise<Beds24TokenResponse> {
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
    } catch (error: any) {
      logger.error({ 
        error: error.message,
        status: error.response?.status,
        data: error.response?.data 
      }, 'Failed to setup Beds24 authentication');
      throw error;
    }
  }

  /**
   * Refresh access token usando refresh token
   */
  async refreshToken(refreshToken: string): Promise<Beds24TokenResponse> {
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
    } catch (error: any) {
      logger.error({ 
        error: error.message,
        status: error.response?.status 
      }, 'Failed to refresh Beds24 token');
      throw error;
    }
  }

  /**
   * Obtener detalles del token y verificar scopes
   */
  async getTokenDetails(token: string): Promise<Beds24TokenDetails> {
    try {
      const response = await this.authApi.get('/details', {
        headers: {
          token: token,
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error({ 
        error: error.message,
        status: error.response?.status 
      }, 'Failed to get Beds24 token details');
      throw error;
    }
  }

  /**
   * Revocar refresh token
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      await this.authApi.delete('/token', {
        headers: {
          refreshToken: refreshToken,
        },
      });

      logger.info('Beds24 refresh token revoked successfully');
    } catch (error: any) {
      logger.error({ 
        error: error.message 
      }, 'Failed to revoke Beds24 refresh token');
      throw error;
    }
  }
}

export const beds24Auth = new Beds24Auth();