// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding hotel apartments...');
  
  // Datos iniciales de los apartamentos basados en roomIds reales de Beds24
  const apartments = [
    {
      roomId: 378318,
      apartmentName: "Aparta Estudio 1722-B",
      maxAdults: "4 (incluyendo niños mayores de 5 años)",
      fixedCharge: 60000
    },
    {
      roomId: 378320,
      apartmentName: "Aparta-Estudio 2005-B", 
      maxAdults: "4 (incluyendo niños mayores de 5 años)",
      fixedCharge: 60000
    },
    {
      roomId: 378317,
      apartmentName: "Apartamento 1317",
      maxAdults: "6 (incluyendo niños mayores de 5 años)",
      fixedCharge: 70000
    },
    {
      roomId: 378321,
      apartmentName: "Apartamento 1722-A",
      maxAdults: "6 (incluyendo niños mayores de 5 años)",
      extraCharges: {
        parking: 15000,
        fixed_charge: 70000, // Cargo fijo Apartamentos
        late_checkin: 25000,
        extra_guest: 35000
      }
    },
    {
      roomId: 378316,
      apartmentName: "Apartamento 1820",
      maxAdults: "6 (incluyendo niños mayores de 5 años)",
      fixedCharge: 70000
    },
    {
      roomId: 506591,
      apartmentName: "Apartamento 715",
      maxAdults: "8 (incluyendo niños mayores de 5 años)",
      fixedCharge: 70000
    }
  ];

  // Usar upsert para evitar duplicados
  for (const apartment of apartments) {
    await prisma.hotelApartment.upsert({
      where: { roomId: apartment.roomId },
      update: apartment,
      create: apartment,
    });
    console.log(`✅ Apartment ${apartment.apartmentName} (roomId: ${apartment.roomId})`);
  }

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });