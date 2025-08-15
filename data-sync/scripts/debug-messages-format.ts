#!/usr/bin/env tsx
/**
 * DEBUG: Verificar formato exacto de mensajes de Beds24 API
 */
import { getBeds24Client } from '../src/providers/beds24/client.js';

async function debugMessagesFormat() {
  console.log('🔍 DEBUG: Messages format from Beds24 API');
  
  const client = getBeds24Client();
  const bookingId = '63502204'; // Este tiene 4 mensajes según el log

  try {
    const response = await client.requestWithRetry({
      method: 'GET',
      url: `/bookings/messages?bookingId=${bookingId}&maxAge=365`,
    });

    console.log('\n🔍 RESPONSE ANALYSIS:');
    console.log('response.data type:', typeof response.data);
    console.log('response.data is Array:', Array.isArray(response.data));
    console.log('response.data length:', response.data?.length || 'N/A');
    console.log('response.success:', response.success);
    console.log('response.status:', response.status);

    console.log('\n📋 RESPONSE.DATA CONTENT:');
    if (response.data && Array.isArray(response.data)) {
      console.log('✅ Data is array with', response.data.length, 'items');
      if (response.data.length > 0) {
        console.log('\n📄 FIRST MESSAGE:');
        console.log(JSON.stringify(response.data[0], null, 2));
      }
    } else {
      console.log('❌ Data is not array or is empty');
      console.log('Data value:', response.data);
    }

  } catch (error: any) {
    console.log('❌ Error:', error.message);
  }
}

debugMessagesFormat().catch(console.error);