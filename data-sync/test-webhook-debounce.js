/**
 * Test script for webhook debounce
 * 
 * Sends multiple webhooks rapidly to verify only one processing occurs
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:8080';
const BOOKING_ID = '74951941'; // Test booking ID

async function sendWebhook(suffix = '') {
  const payload = {
    booking: {
      id: BOOKING_ID,
      firstName: `TEST ${suffix}`,
      status: 'confirmed',
      modifiedTime: new Date().toISOString(),
      propertyId: 173308,
      notes: `Test webhook ${suffix} at ${new Date().toISOString()}`
    }
  };

  try {
    const response = await axios.post(`${BASE_URL}/api/v1/beds24/v2`, payload);
    console.log(`✓ Webhook ${suffix} sent:`, response.data);
  } catch (error) {
    console.error(`✗ Webhook ${suffix} failed:`, error.message);
  }
}

async function getStatus() {
  try {
    const response = await axios.get(`${BASE_URL}/api/v1/beds24/v2/status`);
    return response.data;
  } catch (error) {
    console.error('Failed to get status:', error.message);
    return null;
  }
}

async function runTest() {
  console.log('🧪 Starting webhook debounce test...\n');
  
  // Check initial status
  let status = await getStatus();
  console.log('Initial status:', status);
  console.log('');

  // Send multiple webhooks rapidly (simulating Beds24 behavior)
  console.log('📤 Sending 5 webhooks in rapid succession...');
  await sendWebhook('1');
  await new Promise(r => setTimeout(r, 500)); // 0.5 sec
  
  await sendWebhook('2');
  await new Promise(r => setTimeout(r, 1000)); // 1 sec
  
  await sendWebhook('3');
  await new Promise(r => setTimeout(r, 500)); // 0.5 sec
  
  await sendWebhook('4');
  await new Promise(r => setTimeout(r, 2000)); // 2 sec
  
  await sendWebhook('5 - FINAL');
  
  console.log('\n📊 Checking status after sending webhooks...');
  status = await getStatus();
  console.log('Pending webhooks:', status.pending);
  console.log('Debounced count:', status.debouncedTotal);
  
  // Wait and check periodically
  console.log('\n⏳ Waiting for processing (checking every 20 seconds)...');
  
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 20000)); // 20 sec
    status = await getStatus();
    console.log(`[${i*20 + 20}s] Pending: ${status.pending}, Processed: ${status.processedTotal}, Debounced: ${status.debouncedTotal}`);
    
    if (status.pending === 0) {
      console.log('\n✅ All webhooks processed!');
      console.log('Total processed:', status.processedTotal);
      console.log('Total debounced (saved):', status.debouncedTotal);
      console.log('\n🎉 Test complete! Only 1 processing should have occurred for 5 webhooks.');
      break;
    }
  }
}

// Run the test
runTest().catch(console.error);