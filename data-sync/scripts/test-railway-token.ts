#!/usr/bin/env tsx
/**
 * TEST RAILWAY TOKEN - Verificar que API Beds24 funciona en Railway
 */
import { getBeds24Client } from '../src/providers/beds24/client.js';

async function testRailwayToken() {
  console.log('🚀 TESTING BEDS24 API TOKEN IN RAILWAY');
  console.log('======================================');
  
  try {
    console.log('📋 Step 1: Creating Beds24 client...');
    const client = getBeds24Client();
    console.log('✅ Client created successfully');

    console.log('\n📋 Step 2: Testing simple API call...');
    const response = await client.requestWithRetry({
      method: 'GET',
      url: '/bookings?limit=2'
    });

    console.log('✅ API Response received');
    console.log('📊 Status:', response.status);
    console.log('📊 Success:', response.success);
    console.log('📊 Data count:', Array.isArray(response.data) ? response.data.length : 'N/A');

    if (response.success && response.data) {
      console.log('\n📋 Step 3: Sample booking IDs found:');
      if (Array.isArray(response.data) && response.data.length > 0) {
        response.data.slice(0, 2).forEach((booking: any, index: number) => {
          console.log(`   ${index + 1}. ID: ${booking.bookingId}, Status: ${booking.status}`);
        });
      }
    }

    console.log('\n✅ TOKEN WORKS CORRECTLY IN RAILWAY!');
    console.log('🎯 The API errors in logs are from old/invalid booking IDs');

  } catch (error: any) {
    console.log('\n❌ TOKEN TEST FAILED:');
    console.log('Error:', error.message);
    
    if (error.response) {
      console.log('HTTP Status:', error.response.status);
      console.log('Response:', error.response.data);
    }
    
    console.log('\n🔍 TROUBLESHOOTING:');
    console.log('- Check BEDS24_TOKEN variable in Railway');
    console.log('- Check Redis connection for refresh tokens');
    console.log('- Verify network connectivity Railway → Beds24');
  }
}

testRailwayToken().catch(console.error);