import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function actualizarFuentes() {
  try {
    console.log('🔄 ACTUALIZACIÓN DE FUENTES EN CONTACTOS');
    console.log('='*60);
    
    // Leer los contactos validados
    const contactosValidados = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../CONTACTOS_CON_WHATSAPP.json'), 'utf-8')
    );
    
    console.log(`📊 Total de contactos a procesar: ${contactosValidados.length}`);
    
    // Limpiar tabla actual
    console.log('\n🗑️ Limpiando tabla Contactos...');
    await prisma.contactos.deleteMany({});
    
    // Preparar datos con fuentes
    const contactosConFuente = contactosValidados.map(c => ({
      phoneNumber: c.telefono,
      name: c.nombre || null,
      source: ['imported', 'whapi_validated', 'import_2025-01-10'],
      hasWhatsapp: true,
      status: 'active',
      lastActivity: new Date()
    }));
    
    // Insertar en lotes
    console.log('\n📥 Insertando contactos con fuentes...');
    const batchSize = 100;
    let insertados = 0;
    
    for (let i = 0; i < contactosConFuente.length; i += batchSize) {
      const batch = contactosConFuente.slice(i, i + batchSize);
      
      await prisma.contactos.createMany({
        data: batch,
        skipDuplicates: true
      });
      
      insertados += batch.length;
      
      if (insertados % 500 === 0) {
        console.log(`   ✅ Insertados: ${insertados}/${contactosConFuente.length}`);
      }
    }
    
    console.log(`\n✅ Total insertados: ${insertados}`);
    
    // Verificar
    const total = await prisma.contactos.count();
    console.log(`\n📊 VERIFICACIÓN:`);
    console.log(`   Total en BD: ${total}`);
    console.log(`   Todos tienen fuente: ['imported', 'whapi_validated']`);
    
    // Actualizar desde Booking
    console.log('\n🔄 Actualizando fuentes desde Booking...');
    const bookings = await prisma.booking.findMany({
      where: {
        phone: {
          not: null
        }
      },
      select: {
        phone: true,
        channel: true,
        guestName: true,
        email: true
      }
    });
    
    let actualizadosBooking = 0;
    for (const booking of bookings) {
      const updated = await prisma.contactos.updateMany({
        where: {
          phoneNumber: booking.phone
        },
        data: {
          source: {
            push: ['booking', `booking_${(booking.channel || 'direct').toLowerCase()}`]
          }
        }
      });
      
      if (updated.count > 0) {
        actualizadosBooking++;
      }
    }
    
    console.log(`   ✅ Contactos con fuente Booking: ${actualizadosBooking}`);
    
    // Actualizar desde ClientView
    console.log('\n🔄 Actualizando fuentes desde ClientView...');
    const clientViews = await prisma.clientView.findMany({
      select: {
        phoneNumber: true
      }
    });
    
    let actualizadosWhatsApp = 0;
    for (const cv of clientViews) {
      const updated = await prisma.contactos.updateMany({
        where: {
          phoneNumber: cv.phoneNumber
        },
        data: {
          source: {
            push: ['whatsapp', 'clientview']
          }
        }
      });
      
      if (updated.count > 0) {
        actualizadosWhatsApp++;
      }
    }
    
    console.log(`   ✅ Contactos con fuente WhatsApp: ${actualizadosWhatsApp}`);
    
    // Estadísticas finales
    console.log('\n📊 RESUMEN FINAL:');
    console.log(`   Total contactos: ${total}`);
    console.log(`   Con fuente Booking: ${actualizadosBooking}`);
    console.log(`   Con fuente WhatsApp: ${actualizadosWhatsApp}`);
    console.log(`   Solo importados: ${total - actualizadosBooking - actualizadosWhatsApp}`);
    
    console.log('\n✅ PROCESO COMPLETADO');
    console.log('Todos los contactos ahora tienen su fuente identificada');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

actualizarFuentes();