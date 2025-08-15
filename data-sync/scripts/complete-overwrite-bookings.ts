#!/usr/bin/env tsx

/**
 * SOBREESCRITURA COMPLETA DE BOOKINGS
 * 
 * Actualiza TODAS las reservas desde 1 agosto 2025 en adelante
 * SIN importar status: confirmed, new, cancelled, inquiry, etc.
 * SOBREESCRIBE completamente todos los datos
 */

import { getBeds24Client } from '../src/providers/beds24/client.js';
import { connectPrisma, prisma } from '../src/infra/db/prisma.client.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🔄 COMPLETE OVERWRITE - All bookings from August 1, 2025 onwards');
  console.log('📋 Will process ALL statuses: confirmed, new, cancelled, inquiry, etc.');
  
  try {
    // Conectar BD
    await connectPrisma();
    console.log('✅ Connected to database');

    // Obtener cliente Beds24
    const client = getBeds24Client();
    console.log('✅ Beds24 client ready');

    console.log('\n📥 Fetching ALL bookings since August 1, 2025...');
    
    let allBookings: any[] = [];
    let offset = 0;
    const batchSize = 100;
    let hasMore = true;

    // Obtener TODAS las reservas sin filtro de status
    while (hasMore) {
      console.log(`📦 Batch ${Math.floor(offset/batchSize) + 1}: offset ${offset}`);
      
      const batch = await client.getBookings({
        // SOLO filtro por fecha - SIN filtro de status
        modifiedSince: '2025-08-01',
        limit: batchSize,
        offset: offset,
        includeInvoice: true,
        includeInfoItems: true,
        includeComments: true
      });

      if (batch.length === 0) {
        hasMore = false;
        console.log('📋 No more bookings');
      } else {
        // Agregar TODOS los bookings sin filtro
        allBookings.push(...batch);
        offset += batchSize;
        
        // Mostrar distribución de status
        const statusCounts = batch.reduce((acc: any, booking: any) => {
          const status = booking.status || 'unknown';
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, {});
        
        console.log(`✅ Got ${batch.length} bookings | Total: ${allBookings.length}`);
        console.log(`📊 Status in batch: ${Object.entries(statusCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`);
        
        // Rate limiting
        await delay(1000);
      }

      // Safety limit
      if (allBookings.length > 1000) {
        console.log('🛑 Safety limit (1000 bookings) - stopping fetch');
        break;
      }
    }

    console.log(`\n📊 TOTAL FETCHED: ${allBookings.length} bookings`);

    // Mostrar distribución completa de status
    const totalStatusCounts = allBookings.reduce((acc: any, booking: any) => {
      const status = booking.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    console.log('\n📋 STATUS DISTRIBUTION:');
    Object.entries(totalStatusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} bookings`);
    });

    if (allBookings.length === 0) {
      console.log('⚠️ No bookings to process');
      return;
    }

    // SOBREESCRIBIR TODO
    console.log('\n🔄 STARTING COMPLETE OVERWRITE...');
    
    let processed = 0;
    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const booking of allBookings) {
      try {
        const bookingId = booking.id?.toString();
        if (!bookingId) {
          console.log('⚠️ Skipping booking without ID');
          continue;
        }

        // DATOS COMPLETOS para sobreescritura
        const completeBookingData = {
          bookingId: bookingId,
          phone: booking.phone || null,
          guestName: booking.guestName || booking.firstName || null,
          status: booking.status || null,
          internalNotes: booking.internalNotes || null,
          propertyName: booking.propertyName || null,
          arrivalDate: booking.arrival || null,
          departureDate: booking.departure || null,
          numNights: booking.numNights || null,
          totalPersons: (booking.numAdult || 0) + (booking.numChild || 0) || null,
          totalCharges: booking.totalPrice?.toString() || booking.price?.toString() || null,
          totalPayments: booking.totalPayments?.toString() || null,
          balance: booking.balance?.toString() || null,
          basePrice: booking.basePrice?.toString() || booking.price?.toString() || null,
          channel: booking.channel || booking.referer || null,
          email: booking.email || null,
          apiReference: booking.apiReference || null,
          charges: booking.charges || [],
          payments: booking.payments || [],
          messages: booking.messages || [],
          infoItems: booking.infoItems || [],
          notes: booking.comments || booking.notes || null,
          bookingDate: booking.bookingTime || booking.created || null,
          modifiedDate: booking.modifiedTime || booking.modified || null,
          lastUpdatedBD: new Date(),
          raw: booking, // Data completa original
          BDStatus: null // Se calculará automáticamente si tienes lógica para eso
        };

        // Verificar si existe
        const existing = await prisma.booking.findUnique({
          where: { bookingId }
        });

        // UPSERT - sobreescribe completamente
        await prisma.booking.upsert({
          where: { bookingId },
          create: completeBookingData,
          update: {
            ...completeBookingData,
            id: undefined // No actualizar el ID auto-increment
          }
        });

        if (existing) {
          updated++;
          console.log(`🔄 ${bookingId} [${booking.status}] - OVERWRITTEN`);
        } else {
          created++;
          console.log(`✨ ${bookingId} [${booking.status}] - CREATED`);
        }
        
        processed++;

        // Progress cada 25
        if (processed % 25 === 0) {
          const progress = ((processed/allBookings.length)*100).toFixed(1);
          console.log(`📊 Progress: ${processed}/${allBookings.length} (${progress}%) | Created: ${created} | Updated: ${updated}`);
        }

      } catch (error: any) {
        errors++;
        console.log(`❌ Error ${booking.id}: ${error.message}`);
      }

      // Small delay para no sobrecargar BD
      await delay(50);
    }

    // RESUMEN FINAL
    console.log('\n' + '='.repeat(60));
    console.log('🏆 COMPLETE OVERWRITE FINISHED');
    console.log('='.repeat(60));
    console.log(`📊 RESULTS:`);
    console.log(`   • Total fetched: ${allBookings.length}`);
    console.log(`   • Successfully processed: ${processed}`);
    console.log(`   • New records created: ${created}`);
    console.log(`   • Existing records updated: ${updated}`);
    console.log(`   • Errors: ${errors}`);
    console.log(`   • Success rate: ${((processed/(processed + errors))*100).toFixed(1)}%`);
    
    console.log(`\n📋 STATUS BREAKDOWN PROCESSED:`);
    const processedStatusCounts = allBookings
      .filter(b => b.id?.toString()) // Solo los que tenían ID válido
      .reduce((acc: any, booking: any) => {
        const status = booking.status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
    
    Object.entries(processedStatusCounts).forEach(([status, count]) => {
      console.log(`   • ${status}: ${count} bookings`);
    });

    console.log('\n✅ All booking data from August 2025+ has been overwritten!');

  } catch (error: any) {
    console.error('❌ OVERWRITE FAILED:', error.message);
    process.exit(1);
  }
}

main();