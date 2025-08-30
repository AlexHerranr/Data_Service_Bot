#!/usr/bin/env node

/**
 * Poblar la tabla hotel_apartments con los datos de propiedades
 */

import { connectPrisma } from './dist/infra/db/prisma.client.js';
import { prisma } from './dist/infra/db/prisma.client.js';

const properties = [
  { propertyId: 173207, propertyName: '2005-A', roomId: 173207, roomName: 'Apartamento 2005-A' },
  { propertyId: 173307, propertyName: '1820', roomId: 173307, roomName: 'Apartamento 1820' },
  { propertyId: 173308, propertyName: '1317', roomId: 173308, roomName: 'Apartamento 1317' },
  { propertyId: 173309, propertyName: '1722-B', roomId: 173309, roomName: 'Apartamento 1722-B' },
  { propertyId: 173311, propertyName: '2005-B', roomId: 173311, roomName: 'Apartamento 2005-B' },
  { propertyId: 173312, propertyName: '1722-A', roomId: 173312, roomName: 'Apartamento 1722-A' },
  { propertyId: 240061, propertyName: '0715', roomId: 240061, roomName: 'Apartamento 0715' },
  { propertyId: 280243, propertyName: 'punta arena tierra bomba', roomId: 280243, roomName: 'Punta Arena Tierra Bomba' }
];

async function populateHotelApartments() {
  try {
    await connectPrisma();
    console.log('✅ Conectado a la base de datos\n');
    
    console.log('📋 Actualizando tabla hotel_apartments...\n');
    
    for (const prop of properties) {
      try {
        // Upsert: crear o actualizar
        const result = await prisma.hotel_apartments.upsert({
          where: { roomId: prop.roomId },
          update: {
            propertyName: prop.propertyName,
            roomName: prop.roomName
          },
          create: {
            propertyId: prop.propertyId,
            roomId: prop.roomId,
            roomName: prop.roomName,
            propertyName: prop.propertyName,
            capacity: 4,
            extraCharge: {
              amount: 70000,
              description: "Cargo adicional:"
            }
          }
        });
        
        console.log(`✅ ${result.propertyName}: ${result.roomName} (ID: ${result.roomId})`);
        
      } catch (error) {
        console.log(`❌ Error con ${prop.propertyName}: ${error.message}`);
      }
    }
    
    // Verificar el resultado
    const allApartments = await prisma.hotel_apartments.findMany({
      orderBy: { propertyName: 'asc' }
    });
    
    console.log(`\n📊 Total de apartamentos en la tabla: ${allApartments.length}\n`);
    console.log('Lista completa:');
    for (const apt of allApartments) {
      console.log(`  - ${apt.propertyName || 'Sin nombre'}: ${apt.roomName} (Property ID: ${apt.propertyId})`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

populateHotelApartments();