#!/usr/bin/env tsx
/**
 * CREAR RESERVA DE PRUEBA DICIEMBRE 2025
 * 
 * Crea una reserva nueva en Beds24 para probar webhook
 */
import { getBeds24Client } from '../src/providers/beds24/client.js';
import axios from 'axios';
import { env } from '../src/config/env.js';
import fs from 'fs';
import path from 'path';

// Cargar .env manualmente para asegurar que tenemos el write token
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const writeTokenMatch = envContent.match(/BEDS24_WRITE_REFRESH_TOKEN="([^"]+)"/);
  if (writeTokenMatch) {
    process.env.BEDS24_WRITE_REFRESH_TOKEN = writeTokenMatch[1];
  }
}

async function createTestBooking() {
  console.log('🏨 CREATING TEST BOOKING - December 2025');
  console.log('==========================================');
  
  try {
    const client = getBeds24Client();
    console.log('✅ Beds24 client ready');
    
    // Para operaciones WRITE necesitamos refresh token específico
    console.log('🔑 Using write refresh token from env...');

    // Datos de la reserva de prueba
    const testBooking = {
      propertyId: 173207, // Property ID de TeAlquilamos
      roomId: 378110,     // Room ID existente
      arrival: '2025-12-28',     // Llegada: 28 diciembre 2025
      departure: '2025-12-30',   // Salida: 30 diciembre 2025
      numAdults: 2,
      numChildren: 0,
      guestFirstName: 'Claude',
      guestName: 'Test Webhook',
      guestEmail: 'claude.test@anthropic.com',
      guestPhone: '+573001234567',
      status: 'new',
      channel: 'direct',
      notes: 'BOOKING DE PRUEBA - Webhook Test - Created via Claude Code',
      totalPrice: 150000
    };

    console.log('\n📋 Booking Details:');
    console.log(`   Dates: ${testBooking.arrival} → ${testBooking.departure}`);
    console.log(`   Guest: ${testBooking.guestName}`);
    console.log(`   Phone: ${testBooking.guestPhone}`);
    console.log(`   Email: ${testBooking.guestEmail}`);
    console.log(`   Price: $${testBooking.totalPrice}`);

    console.log('\n🚀 Creating booking in Beds24...');

    // Paso 1: Obtener access token usando refresh token
    const refreshToken = 'NTEMt84pthHT2EHUE51k/wz9AvzLFkMXi//0pJarMpu8hUMW8nm0p97AqY0WTddCfCRy2i6AUc/VSPwwfweMfcrj3GDRlWDarg0ENoVLlB+BvDLd/Lw3w6UcMjUwcodUQxRrUZhJGKsevwS5bpH9OkbtDFg6dINPAAw/6PkMWFg=';
    console.log(`🔑 Step 1: Getting access token with refresh token...`);

    const authResponse = await axios.get(
      `${env.BEDS24_API_URL}/authentication/token`,
      {
        headers: {
          'refreshToken': refreshToken
        }
      }
    );

    const accessToken = authResponse.data.token;
    console.log(`✅ Got access token: ${accessToken?.substring(0, 20)}...`);

    // Paso 2: Crear booking con access token
    console.log(`🔑 Step 2: Creating booking with access token...`);
    
    const response = await axios.post(
      `${env.BEDS24_API_URL}/bookings`,
      [testBooking],  // ✅ ARRAY requerido por Beds24 API
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'token': accessToken  // ✅ Access token obtenido
        },
        timeout: 30000
      }
    );

    if (response.status === 200 && response.data) {
      const bookingId = response.data[0]?.bookingId || response.data[0]?.id;
      
      console.log('\n✅ BOOKING CREATED SUCCESSFULLY!');
      console.log('==========================================');
      console.log(`🆔 Booking ID: ${bookingId}`);
      console.log(`📅 Check-in: ${testBooking.arrival}`);
      console.log(`📅 Check-out: ${testBooking.departure}`);
      console.log(`👤 Guest: ${testBooking.guestName}`);
      
      console.log('\n🔔 WEBHOOK SHOULD TRIGGER NOW!');
      console.log('⏰ Wait 10 seconds and check database...');
      console.log(`🔍 Look for bookingId: ${bookingId} in Booking table`);
      
      return bookingId;
      
    } else {
      console.log('\n❌ BOOKING CREATION FAILED');
      console.log('Status:', response.status);
      console.log('Data:', JSON.stringify(response.data, null, 2));
    }

  } catch (error: any) {
    console.log('\n❌ ERROR CREATING BOOKING:');
    console.log('Message:', error.message);
    
    if (error.response) {
      console.log('HTTP Status:', error.response.status);
      console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.log('\n🔍 POSSIBLE CAUSES:');
    console.log('- Property/Room ID invalid');
    console.log('- Date conflicts or restrictions');
    console.log('- Missing required fields');
    console.log('- API permissions (write token needed)');
  }
}

createTestBooking().catch(console.error);