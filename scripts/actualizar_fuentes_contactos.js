#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function actualizarFuentesContactos() {
  try {
    console.log('🔄 ACTUALIZACIÓN DE FUENTES EN CONTACTOS');
    console.log('='*60);
    
    // 1. Leer los contactos validados por WhatsApp
    const archivoContactos = path.join(__dirname, '../CONTACTOS_CON_WHATSAPP.json');
    const contactosValidados = JSON.parse(fs.readFileSync(archivoContactos, 'utf-8'));
    
    console.log(`📊 Total de contactos a procesar: ${contactosValidados.length}`);
    
    // 2. Obtener información de Booking para identificar fuentes
    console.log('\n🔍 Analizando fuentes de contactos...');
    
    const bookingPhones = await prisma.booking.findMany({
      select: {
        phone: true,
        channel: true,
        bookingDate: true
      },
      where: {
        phone: {
          not: null
        }
      }
    });
    
    // Crear mapa de teléfonos de Booking
    const phoneToBooking = new Map();
    bookingPhones.forEach(b => {
      if (b.phone) {
        phoneToBooking.set(b.phone, {
          channel: b.channel,
          bookingDate: b.bookingDate
        });
      }
    });
    
    // 3. Obtener información de ClientView
    const clientViewPhones = await prisma.clientView.findMany({
      select: {
        phoneNumber: true,
        labels: true
      }
    });
    
    // Crear mapa de teléfonos de ClientView
    const phoneToClientView = new Set();
    clientViewPhones.forEach(c => {
      phoneToClientView.add(c.phoneNumber);
    });
    
    console.log(`   📚 Contactos de Booking: ${phoneToBooking.size}`);
    console.log(`   💬 Contactos de ClientView: ${phoneToClientView.size}`);
    
    // 4. Analizar y categorizar fuentes
    const estadisticas = {
      soloBooking: 0,
      soloWhatsApp: 0,
      soloImportado: 0,
      bookingYWhatsApp: 0,
      multiple: 0
    };
    
    const contactosConFuente = [];
    
    for (const contacto of contactosValidados) {
      const sources = [];
      const telefono = contacto.telefono;
      
      // Verificar si viene de Booking
      if (phoneToBooking.has(telefono)) {
        const booking = phoneToBooking.get(telefono);
        sources.push('booking');
        if (booking.channel) {
          sources.push(`booking_${booking.channel.toLowerCase()}`);
        }
      }
      
      // Verificar si está en ClientView (WhatsApp activo)
      if (phoneToClientView.has(telefono)) {
        sources.push('whatsapp');
        sources.push('clientview');
      }
      
      // Si no tiene fuente específica, es importado
      if (sources.length === 0) {
        sources.push('imported');
        sources.push('whapi_validated');
        estadisticas.soloImportado++;
      } else if (sources.includes('booking') && sources.includes('whatsapp')) {
        estadisticas.bookingYWhatsApp++;
      } else if (sources.includes('booking')) {
        estadisticas.soloBooking++;
      } else if (sources.includes('whatsapp')) {
        estadisticas.soloWhatsApp++;
      }
      
      // Agregar fecha de importación
      sources.push('import_2025-01-10');
      
      contactosConFuente.push({
        phoneNumber: telefono,
        name: contacto.nombre || null,
        source: sources,
        hasWhatsapp: true // Todos estos fueron validados por Whapi
      });
    }
    
    console.log('\n📈 DISTRIBUCIÓN DE FUENTES:');
    console.log(`   Solo Booking:        ${estadisticas.soloBooking}`);
    console.log(`   Solo WhatsApp:       ${estadisticas.soloWhatsApp}`);
    console.log(`   Booking + WhatsApp:  ${estadisticas.bookingYWhatsApp}`);
    console.log(`   Solo Importado:      ${estadisticas.soloImportado}`);
    
    // 5. Actualizar la base de datos
    console.log('\n💾 Actualizando base de datos...');
    
    // Primero, limpiar la tabla
    await prisma.contactos.deleteMany({});
    console.log('   ✅ Tabla limpiada');
    
    // Insertar en lotes
    const batchSize = 100;
    let insertados = 0;
    
    for (let i = 0; i < contactosConFuente.length; i += batchSize) {
      const batch = contactosConFuente.slice(i, i + batchSize);
      
      await prisma.contactos.createMany({
        data: batch.map(c => ({
          phoneNumber: c.phoneNumber,
          name: c.name,
          source: c.source,
          hasWhatsapp: c.hasWhatsapp,
          status: 'active',
          lastActivity: new Date()
        })),
        skipDuplicates: true
      });
      
      insertados += batch.length;
      
      if (insertados % 500 === 0) {
        console.log(`   ✅ Insertados: ${insertados}/${contactosConFuente.length}`);
      }
    }
    
    console.log(`\n✅ Total insertados: ${insertados}`);
    
    // 6. Verificación y estadísticas finales
    const verificacion = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN 'booking' = ANY(source) AND 'whatsapp' = ANY(source) THEN 'Booking + WhatsApp'
          WHEN 'booking' = ANY(source) THEN 'Solo Booking'
          WHEN 'whatsapp' = ANY(source) THEN 'Solo WhatsApp'
          WHEN 'imported' = ANY(source) THEN 'Solo Importado'
          ELSE 'Otro'
        END as tipo_fuente,
        COUNT(*) as total
      FROM "Contactos"
      GROUP BY tipo_fuente
      ORDER BY total DESC
    `;
    
    console.log('\n📊 VERIFICACIÓN EN BD:');
    verificacion.forEach(v => {
      console.log(`   ${v.tipo_fuente}: ${v.total} contactos`);
    });
    
    // 7. Ejemplos de cada tipo
    console.log('\n📝 EJEMPLOS POR FUENTE:');
    
    const ejemploBooking = await prisma.contactos.findFirst({
      where: {
        source: {
          has: 'booking'
        }
      }
    });
    if (ejemploBooking) {
      console.log(`\n   BOOKING: ${ejemploBooking.name || 'Sin nombre'}`);
      console.log(`   Tel: ${ejemploBooking.phoneNumber}`);
      console.log(`   Fuentes: ${ejemploBooking.source.join(', ')}`);
    }
    
    const ejemploWhatsApp = await prisma.contactos.findFirst({
      where: {
        source: {
          has: 'whatsapp'
        }
      }
    });
    if (ejemploWhatsApp) {
      console.log(`\n   WHATSAPP: ${ejemploWhatsApp.name || 'Sin nombre'}`);
      console.log(`   Tel: ${ejemploWhatsApp.phoneNumber}`);
      console.log(`   Fuentes: ${ejemploWhatsApp.source.join(', ')}`);
    }
    
    const ejemploImportado = await prisma.contactos.findFirst({
      where: {
        source: {
          has: 'imported'
        }
      }
    });
    if (ejemploImportado) {
      console.log(`\n   IMPORTADO: ${ejemploImportado.name || 'Sin nombre'}`);
      console.log(`   Tel: ${ejemploImportado.phoneNumber}`);
      console.log(`   Fuentes: ${ejemploImportado.source.join(', ')}`);
    }
    
    console.log('\n✅ PROCESO COMPLETADO');
    console.log('Todos los contactos ahora tienen su fuente identificada');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
actualizarFuentesContactos();