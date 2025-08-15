#!/usr/bin/env node
/**
 * 🧪 TESTS BEDS24 PROPERTIES API
 * 
 * Casos de prueba para los endpoints de Properties y Rooms
 * Usando long life token READ para todas las consultas
 */

import { beds24Client } from '../dist/integrations/beds24.client.js';
import { config } from 'dotenv';

// Load environment variables
config();

console.log('🏨 BEDS24 PROPERTIES API TESTS\n');
console.log('='.repeat(50));

/**
 * TEST 1: GET /properties - Obtener todas las propiedades
 */
async function testGetProperties() {
  console.log('\n📋 TEST 1: GET /properties - Obtener todas las propiedades');
  console.log('-'.repeat(50));
  
  try {
    console.log('🔍 Consultando propiedades...');
    const startTime = Date.now();
    
    const properties = await beds24Client.getProperties();
    
    const duration = Date.now() - startTime;
    console.log(`⏱️  Tiempo respuesta: ${duration}ms`);
    
    // Validar estructura de respuesta
    if (!properties || !properties.data) {
      throw new Error('Respuesta no tiene estructura data esperada');
    }
    
    const count = properties.data.length || 0;
    console.log(`✅ Propiedades encontradas: ${count}`);
    
    if (count > 0) {
      const firstProperty = properties.data[0];
      console.log('\n📊 Estructura primera propiedad:');
      console.log('📍 Campos principales:', Object.keys(firstProperty).slice(0, 10).join(', '));
      
      if (firstProperty.id) console.log(`   - ID: ${firstProperty.id}`);
      if (firstProperty.name) console.log(`   - Nombre: ${firstProperty.name}`);
      if (firstProperty.propertyType) console.log(`   - Tipo: ${firstProperty.propertyType}`);
      if (firstProperty.currency) console.log(`   - Moneda: ${firstProperty.currency}`);
      if (firstProperty.address) console.log(`   - Dirección: ${firstProperty.address}`);
      if (firstProperty.city) console.log(`   - Ciudad: ${firstProperty.city}`);
      if (firstProperty.country) console.log(`   - País: ${firstProperty.country}`);
      
      // Análisis de rooms si existen
      if (firstProperty.roomTypes && firstProperty.roomTypes.length > 0) {
        console.log(`   - Tipos habitación: ${firstProperty.roomTypes.length}`);
        const firstRoom = firstProperty.roomTypes[0];
        console.log(`   - Habitación ejemplo: ${firstRoom.name} (Max: ${firstRoom.maxPeople} personas)`);
      }
      
      // Análisis de ofertas si existen
      if (firstProperty.offers && firstProperty.offers.length > 0) {
        console.log(`   - Ofertas disponibles: ${firstProperty.offers.length}`);
      }
    }
    
    return {
      success: true,
      count,
      duration,
      sampleProperty: count > 0 ? properties.data[0] : null
    };
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * TEST 2: GET /properties con parámetros específicos
 */
async function testGetPropertiesWithParams() {
  console.log('\n📋 TEST 2: GET /properties con parámetros específicos');
  console.log('-'.repeat(50));
  
  try {
    console.log('🔍 Consultando propiedades con filtros...');
    
    // Test con includeTexts=all para obtener descripciones
    console.log('   → includeTexts=all');
    const startTime = Date.now();
    
    const propertiesWithTexts = await beds24Client.api.get('/properties', {
      params: {
        includeTexts: 'all'
      },
      requireWrite: false
    });
    
    const duration = Date.now() - startTime;
    console.log(`⏱️  Tiempo respuesta: ${duration}ms`);
    
    const data = propertiesWithTexts.data;
    if (data && data.data && data.data.length > 0) {
      const property = data.data[0];
      console.log(`✅ Propiedades con textos: ${data.data.length}`);
      
      // Verificar textos incluidos
      if (property.texts && property.texts.length > 0) {
        const text = property.texts[0];
        console.log(`   - Idioma: ${text.language}`);
        if (text.propertyDescription) {
          console.log(`   - Descripción: ${text.propertyDescription.substring(0, 100)}...`);
        }
        if (text.headline) {
          console.log(`   - Headline: ${text.headline}`);
        }
      }
    }
    
    return { success: true, duration, withTexts: true };
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * TEST 3: GET /properties/rooms - Obtener habitaciones
 */
async function testGetRooms() {
  console.log('\n📋 TEST 3: GET /properties/rooms - Obtener habitaciones');
  console.log('-'.repeat(50));
  
  try {
    console.log('🔍 Consultando habitaciones...');
    const startTime = Date.now();
    
    const rooms = await beds24Client.api.get('/properties/rooms', {
      requireWrite: false
    });
    
    const duration = Date.now() - startTime;
    console.log(`⏱️  Tiempo respuesta: ${duration}ms`);
    
    const data = rooms.data;
    if (!data || !data.data) {
      throw new Error('Respuesta no tiene estructura data esperada');
    }
    
    const count = data.data.length || 0;
    console.log(`✅ Habitaciones encontradas: ${count}`);
    
    if (count > 0) {
      const firstRoom = data.data[0];
      console.log('\n🏠 Estructura primera habitación:');
      console.log('📍 Campos principales:', Object.keys(firstRoom).slice(0, 10).join(', '));
      
      if (firstRoom.id) console.log(`   - Room ID: ${firstRoom.id}`);
      if (firstRoom.propertyId) console.log(`   - Property ID: ${firstRoom.propertyId}`);
      if (firstRoom.name) console.log(`   - Nombre: ${firstRoom.name}`);
      if (firstRoom.roomType) console.log(`   - Tipo: ${firstRoom.roomType}`);
      if (firstRoom.qty) console.log(`   - Cantidad: ${firstRoom.qty}`);
      if (firstRoom.maxPeople) console.log(`   - Max personas: ${firstRoom.maxPeople}`);
      if (firstRoom.maxAdult) console.log(`   - Max adultos: ${firstRoom.maxAdult}`);
      if (firstRoom.minStay) console.log(`   - Estancia mínima: ${firstRoom.minStay} días`);
      if (firstRoom.rackRate) console.log(`   - Tarifa base: ${firstRoom.rackRate}`);
      
      // Análisis de units si existen
      if (firstRoom.units && firstRoom.units.length > 0) {
        console.log(`   - Unidades disponibles: ${firstRoom.units.length}`);
        const firstUnit = firstRoom.units[0];
        console.log(`   - Unidad ejemplo: ${firstUnit.name} (ID: ${firstUnit.id})`);
      }
      
      // Análisis de precios si existen
      if (firstRoom.priceRules && firstRoom.priceRules.length > 0) {
        console.log(`   - Reglas de precio: ${firstRoom.priceRules.length}`);
        const firstPrice = firstRoom.priceRules[0];
        console.log(`   - Regla ejemplo: ${firstPrice.name}`);
      }
    }
    
    return {
      success: true,
      count,
      duration,
      sampleRoom: count > 0 ? data.data[0] : null
    };
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * TEST 4: GET /properties/rooms con filtro por propiedad
 */
async function testGetRoomsByProperty(propertyId) {
  console.log('\n📋 TEST 4: GET /properties/rooms por propiedad específica');
  console.log('-'.repeat(50));
  
  try {
    console.log(`🔍 Consultando habitaciones para propiedad ${propertyId}...`);
    const startTime = Date.now();
    
    const rooms = await beds24Client.api.get('/properties/rooms', {
      params: {
        propertyId: propertyId,
        includeTexts: 'all',
        includeUnitDetails: true
      },
      requireWrite: false
    });
    
    const duration = Date.now() - startTime;
    console.log(`⏱️  Tiempo respuesta: ${duration}ms`);
    
    const data = rooms.data;
    const count = data?.data?.length || 0;
    console.log(`✅ Habitaciones para propiedad ${propertyId}: ${count}`);
    
    if (count > 0) {
      data.data.forEach((room, index) => {
        console.log(`   ${index + 1}. ${room.name} (${room.roomType}) - Max: ${room.maxPeople}p`);
        if (room.texts && room.texts[0] && room.texts[0].displayName) {
          console.log(`      → Display: ${room.texts[0].displayName}`);
        }
      });
    }
    
    return { success: true, count, duration, propertyId };
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * EJECUTAR TODOS LOS TESTS
 */
async function runAllTests() {
  console.log('🚀 Iniciando tests de Properties API...\n');
  
  const results = {
    properties: null,
    propertiesWithParams: null,
    rooms: null,
    roomsByProperty: null
  };
  
  // Test 1: Properties básico
  results.properties = await testGetProperties();
  
  // Test 2: Properties con parámetros
  results.propertiesWithParams = await testGetPropertiesWithParams();
  
  // Test 3: Rooms básico
  results.rooms = await testGetRooms();
  
  // Test 4: Rooms por propiedad (usar primera propiedad si existe)
  if (results.properties.success && results.properties.sampleProperty) {
    const propertyId = results.properties.sampleProperty.id;
    results.roomsByProperty = await testGetRoomsByProperty(propertyId);
  }
  
  // Resumen final
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMEN DE TESTS');
  console.log('='.repeat(50));
  
  const tests = [
    { name: 'GET /properties', result: results.properties },
    { name: 'GET /properties (con params)', result: results.propertiesWithParams },
    { name: 'GET /properties/rooms', result: results.rooms },
    { name: 'GET /properties/rooms (filtrado)', result: results.roomsByProperty }
  ];
  
  tests.forEach(test => {
    if (test.result) {
      const status = test.result.success ? '✅' : '❌';
      const time = test.result.duration ? `(${test.result.duration}ms)` : '';
      console.log(`${status} ${test.name} ${time}`);
      
      if (!test.result.success) {
        console.log(`   Error: ${test.result.error}`);
      }
    } else {
      console.log(`⏭️  ${test.name} (omitido)`);
    }
  });
  
  // Estadísticas finales
  const successful = tests.filter(t => t.result?.success).length;
  const total = tests.filter(t => t.result).length;
  
  console.log('\n📈 Estadísticas:');
  console.log(`   Tests ejecutados: ${total}`);
  console.log(`   Tests exitosos: ${successful}`);
  console.log(`   Tests fallidos: ${total - successful}`);
  
  if (results.properties.success && results.properties.count > 0) {
    console.log(`   Propiedades encontradas: ${results.properties.count}`);
  }
  
  if (results.rooms.success && results.rooms.count > 0) {
    console.log(`   Habitaciones encontradas: ${results.rooms.count}`);
  }
  
  console.log('\n🎉 Tests completados!');
}

// Ejecutar tests
runAllTests().catch(console.error);