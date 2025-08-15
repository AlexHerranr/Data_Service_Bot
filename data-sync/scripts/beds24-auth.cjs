#!/usr/bin/env node

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { config } = require('dotenv');
const axios = require('axios');

// Load environment variables
config();

class Beds24AuthCLI {
  constructor() {
    this.authApi = axios.create({
      baseURL: 'https://api.beds24.com/v2/authentication',
      timeout: 10000,
    });
  }

  async setupToken(inviteCode, tokenType = 'read', deviceName = null) {
    try {
      const device = deviceName || `BotDataService-${tokenType.toUpperCase()}`;
      
      console.log(`🔐 Setting up ${tokenType.toUpperCase()} token with invite code...`);
      console.log(`📱 Device name: ${device}`);
      
      const response = await this.authApi.get('/setup', {
        headers: {
          code: inviteCode,
          deviceName: device,
        },
      });

      const { token, refreshToken, expiresIn } = response.data;
      
      console.log('\n✅ Setup successful!');
      console.log(`🔑 Access Token: ${token.substring(0, 20)}...`);
      console.log(`♻️  Refresh Token: ${refreshToken.substring(0, 20)}...`);
      console.log(`⏰ Expires in: ${expiresIn} seconds (~${Math.round(expiresIn/3600)} hours)`);
      
      console.log('\n📋 Add to your .env file:');
      console.log(`BEDS24_${tokenType.toUpperCase()}_REFRESH_TOKEN=${refreshToken}`);
      
      return { token, refreshToken, expiresIn };
    } catch (error) {
      console.error('❌ Setup failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async verifyToken(refreshToken, tokenType = 'read') {
    try {
      console.log(`🔍 Verifying ${tokenType.toUpperCase()} token...`);
      
      // Refresh to get current access token
      const tokenResponse = await this.authApi.get('/token', {
        headers: { refreshToken },
      });
      
      // Get token details
      const detailsResponse = await this.authApi.get('/details', {
        headers: { token: tokenResponse.data.token },
      });
      
      const { validToken, token: tokenInfo } = detailsResponse.data;
      
      console.log('\n📊 Token Details:');
      console.log(`✅ Valid: ${validToken}`);
      console.log(`👤 Owner ID: ${tokenInfo.ownerId}`);
      console.log(`📱 Device: ${tokenInfo.deviceName}`);
      console.log(`📅 Created: ${tokenInfo.created}`);
      console.log(`⏰ Expires: ${tokenInfo.expires}`);
      console.log(`🔐 Scopes: ${tokenInfo.scopes.join(', ')}`);
      
      // Check required scopes
      const requiredScopes = tokenType === 'write' 
        ? ['write:bookings', 'all:bookings'] 
        : ['read:bookings'];
        
      const hasRequiredScopes = requiredScopes.some(scope => 
        tokenInfo.scopes.includes(scope)
      );
      
      console.log(`\n✅ Has required ${tokenType} scopes: ${hasRequiredScopes}`);
      
      if (!hasRequiredScopes) {
        console.log(`❌ Missing scopes for ${tokenType} operations`);
        console.log(`📋 Required: ${requiredScopes.join(' OR ')}`);
        console.log(`📋 Available: ${tokenInfo.scopes.join(', ')}`);
      }
      
      return { valid: validToken && hasRequiredScopes, details: tokenInfo };
    } catch (error) {
      console.error('❌ Verification failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async revokeToken(refreshToken, tokenType = 'read') {
    try {
      console.log(`🗑️  Revoking ${tokenType.toUpperCase()} refresh token...`);
      
      await this.authApi.delete('/token', {
        headers: { refreshToken },
      });
      
      console.log('✅ Token revoked successfully');
      console.log(`📝 Remove BEDS24_${tokenType.toUpperCase()}_REFRESH_TOKEN from .env`);
    } catch (error) {
      console.error('❌ Revocation failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async verifyLongLifeToken() {
    try {
      console.log('🔍 Verifying READ long life token...');
      
      const token = process.env.BEDS24_TOKEN;
      if (!token) {
        console.error('❌ No BEDS24_TOKEN found in environment');
        return;
      }
      
      // Test with a simple API call
      const testApi = axios.create({
        baseURL: 'https://api.beds24.com/v2',
        timeout: 10000,
      });
      
      const response = await testApi.get('/bookings', {
        headers: { token: token },
        params: { limit: 1 }
      });
      
      console.log('\n✅ Long life token is valid!');
      console.log(`📊 Test query returned ${response.data.data?.length || 0} bookings`);
      console.log(`🔑 Token: ${token.substring(0, 20)}...`);
      
      return { valid: true };
    } catch (error) {
      console.error('❌ Long life token verification failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async testOperations() {
    console.log('🧪 Testing Beds24 operations...\n');
    
    // Test read token (long life)
    const longLifeToken = process.env.BEDS24_TOKEN;
    if (longLifeToken) {
      console.log('📖 Testing READ operations (long life token)...');
      await this.verifyLongLifeToken();
    } else {
      console.log('⚠️  No READ long life token found');
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test write token
    const writeToken = process.env.BEDS24_WRITE_REFRESH_TOKEN;
    if (writeToken) {
      console.log('✏️  Testing WRITE operations...');
      await this.verifyToken(writeToken, 'write');
    } else {
      console.log('⚠️  No WRITE refresh token found');
    }
  }
}

const cli = new Beds24AuthCLI();

yargs(hideBin(process.argv))
  .command('setup-read <inviteCode>', 'Setup READ-only token', 
    (yargs) => {
      return yargs.positional('inviteCode', {
        describe: 'Invite code from Beds24 (read scopes)',
        type: 'string'
      });
    }, 
    async (argv) => {
      await cli.setupToken(argv.inviteCode, 'read');
    })
  .command('setup-write <inviteCode>', 'Setup WRITE token', 
    (yargs) => {
      return yargs.positional('inviteCode', {
        describe: 'Invite code from Beds24 (write scopes)',
        type: 'string'
      });
    }, 
    async (argv) => {
      await cli.setupToken(argv.inviteCode, 'write');
    })
  .command('verify-read', 'Verify READ long life token', {}, async () => {
    await cli.verifyLongLifeToken();
  })
  .command('verify-write', 'Verify WRITE token', {}, async () => {
    const token = process.env.BEDS24_WRITE_REFRESH_TOKEN;
    if (!token) {
      console.error('❌ No BEDS24_WRITE_REFRESH_TOKEN found in environment');
      process.exit(1);
    }
    await cli.verifyToken(token, 'write');
  })
  .command('revoke-read', 'Revoke READ refresh token', {}, async () => {
    const token = process.env.BEDS24_READ_REFRESH_TOKEN;
    if (!token) {
      console.error('❌ No BEDS24_READ_REFRESH_TOKEN found in environment');
      process.exit(1);
    }
    await cli.revokeToken(token, 'read');
  })
  .command('revoke-write', 'Revoke WRITE refresh token', {}, async () => {
    const token = process.env.BEDS24_WRITE_REFRESH_TOKEN;
    if (!token) {
      console.error('❌ No BEDS24_WRITE_REFRESH_TOKEN found in environment');
      process.exit(1);
    }
    await cli.revokeToken(token, 'write');
  })
  .command('test', 'Test both tokens', {}, async () => {
    await cli.testOperations();
  })
  .demandCommand(1, 'You must specify a command')
  .help()
  .alias('help', 'h')
  .example('$0 setup-read ABC123', 'Setup read-only token with invite code')
  .example('$0 setup-write XYZ789', 'Setup write token with invite code')
  .example('$0 verify-read', 'Verify current read token')
  .example('$0 test', 'Test both read and write tokens')
  .argv;