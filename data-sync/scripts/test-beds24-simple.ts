#!/usr/bin/env npx tsx

/**
 * Script simple para probar Beds24 API sin Redis
 */

import axios from 'axios';
import { env } from '../src/config/env.js';

async function testBeds24Simple() {
  try {
    console.log('🔍 Testing Beds24 API directly (no Redis)...\n');

    // 1. Test long-life token with properties endpoint
    console.log('1️⃣ Testing long-life token with properties...');
    try {
      const response = await axios.get('https://api.beds24.com/v2/properties', {
        headers: {
          'token': env.BEDS24_TOKEN,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data && response.data.success) {
        console.log('✅ Long-life token works!');
        console.log(`📊 Properties count: ${response.data.data?.length || 0}`);
        
        if (response.data.data && response.data.data.length > 0) {
          const firstProp = response.data.data[0];
          console.log(`📋 First property: ${firstProp.propName} (ID: ${firstProp.propId})`);
        }
        console.log('');
      } else {
        console.log('❌ Properties response unsuccessful');
        console.log('Response:', JSON.stringify(response.data, null, 2));
        console.log('');
      }
    } catch (error: any) {
      console.error('❌ Properties test failed:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
      console.log('');
    }

    // 2. Test the FIXED booking endpoint
    console.log('2️⃣ Testing FIXED booking endpoint...');
    try {
      const bookingId = '74310239'; // From logs
      
      // Test OLD way (should fail)
      console.log('🔸 Testing OLD endpoint (should fail)...');
      try {
        const oldResponse = await axios.get(`https://api.beds24.com/v2/bookings/${bookingId}`, {
          headers: { 'token': env.BEDS24_TOKEN },
          timeout: 10000
        });
        console.log('⚠️ OLD endpoint worked (unexpected):', oldResponse.status);
      } catch (oldError: any) {
        console.log(`✅ OLD endpoint failed as expected: ${oldError.response?.status} ${oldError.response?.data?.error || oldError.message}`);
      }

      // Test NEW way (should work)
      console.log('🔸 Testing NEW endpoint (should work)...');
      const newResponse = await axios.get('https://api.beds24.com/v2/bookings', {
        params: {
          id: bookingId,
          includeInvoice: true,
          includeInfoItems: true,
          includeComments: true
        },
        headers: { 'token': env.BEDS24_TOKEN },
        timeout: 10000
      });

      if (newResponse.data && newResponse.data.success) {
        const booking = newResponse.data.data?.[0];
        if (booking) {
          console.log('✅ NEW endpoint works!');
          console.log(`📋 Booking: ${booking.bookingId || booking.id}`);
          console.log(`👤 Guest: ${booking.guestFirstName} ${booking.guestName}`);
          console.log(`🏨 Status: ${booking.status}`);
          console.log(`📅 Arrival: ${booking.arrival}`);
        } else {
          console.log('⚠️ NEW endpoint success but no booking data (may not exist)');
        }
      } else {
        console.log('❌ NEW endpoint unsuccessful');
        console.log('Response:', JSON.stringify(newResponse.data, null, 2));
      }
      console.log('');
    } catch (error: any) {
      console.error('❌ NEW booking endpoint failed:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
      console.log('');
    }

    // 3. Test refresh token if available
    console.log('3️⃣ Testing refresh token (if configured)...');
    if (env.BEDS24_READ_REFRESH_TOKEN || env.BEDS24_WRITE_REFRESH_TOKEN) {
      const refreshToken = env.BEDS24_WRITE_REFRESH_TOKEN || env.BEDS24_READ_REFRESH_TOKEN;
      console.log(`🔑 Using refresh token: ${refreshToken?.substring(0, 20)}...`);
      
      try {
        const refreshResponse = await axios.get('https://api.beds24.com/v2/authentication/token', {
          headers: { 'refreshToken': refreshToken },
          timeout: 10000
        });

        if (refreshResponse.data.token) {
          console.log('✅ Refresh token works!');
          console.log(`📏 New access token length: ${refreshResponse.data.token.length}`);
          console.log(`⏰ Expires in: ${refreshResponse.data.expiresIn} seconds`);
        } else {
          console.log('❌ Refresh response invalid');
          console.log('Response:', JSON.stringify(refreshResponse.data, null, 2));
        }
      } catch (error: any) {
        console.error('❌ Refresh token failed:', error.message);
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Data:', error.response.data);
        }
      }
    } else {
      console.log('⚠️ No refresh token configured in env');
    }
    console.log('');

    // 4. Test invite code setup (if configured)
    console.log('4️⃣ Testing invite code setup (if configured)...');
    if (env.BEDS24_INVITE_CODE_WRITE && env.BEDS24_INVITE_ENABLED === 'true') {
      console.log(`🎟️ Using invite code: ${env.BEDS24_INVITE_CODE_WRITE?.substring(0, 10)}...`);
      
      try {
        const setupResponse = await axios.get('https://api.beds24.com/v2/authentication/setup', {
          headers: { 
            'code': env.BEDS24_INVITE_CODE_WRITE,
            'deviceName': 'TestFromLocal'
          },
          timeout: 10000
        });

        if (setupResponse.data.refreshToken) {
          console.log('✅ Invite code works!');
          console.log(`🔄 Refresh token generated: ${setupResponse.data.refreshToken.substring(0, 20)}...`);
          console.log(`⏰ Access token expires in: ${setupResponse.data.expiresIn} seconds`);
        } else {
          console.log('❌ Setup response invalid');
          console.log('Response:', JSON.stringify(setupResponse.data, null, 2));
        }
      } catch (error: any) {
        console.error('❌ Invite code setup failed:', error.message);
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Data:', error.response.data);
        }
      }
    } else {
      console.log('⚠️ Invite code not configured or disabled');
    }

    console.log('\n🎉 Direct API test completed!');
    console.log('\n📊 Summary:');
    console.log('- Long-life token properties: Check above results');
    console.log('- Fixed booking endpoint: Check above results');
    console.log('- Refresh token: Check above results');
    console.log('- Invite code setup: Check above results');

  } catch (error: any) {
    console.error('💥 Test script error:', error.message);
  }
}

testBeds24Simple().catch(console.error);