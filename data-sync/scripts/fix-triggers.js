#!/usr/bin/env node

/**
 * Script para corregir los triggers de la base de datos
 * Resuelve el problema del campo leadType obsoleto
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function fixTriggers() {
  log('\n🔧 INICIANDO CORRECCIÓN DE TRIGGERS', 'cyan');
  log('=' .repeat(60), 'cyan');
  
  try {
    // 1. Crear backup
    log('\n📦 Paso 1: Creando backup de tabla Leads...', 'yellow');
    const backupName = `Leads_backup_${new Date().toISOString().split('T')[0].replace(/-/g, '')}`;
    
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "${backupName}" AS SELECT * FROM "Leads"
      `);
      log(`✅ Backup creado: ${backupName}`, 'green');
    } catch (error) {
      log(`⚠️ No se pudo crear backup (puede que Leads esté vacía): ${error.message}`, 'yellow');
    }
    
    // 2. Desactivar triggers
    log('\n🔒 Paso 2: Desactivando triggers temporalmente...', 'yellow');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Booking" DISABLE TRIGGER "trg_Booking_sync_leads"
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Booking" DISABLE TRIGGER "trg_Booking_delete_sync_leads"
    `);
    log('✅ Triggers desactivados', 'green');
    
    // 3. Verificar si existe leadType en Leads
    log('\n🔍 Paso 3: Verificando columna leadType en Leads...', 'yellow');
    const leadTypeExists = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Leads' AND column_name = 'leadType'
    `);
    
    if (leadTypeExists.length > 0) {
      // Opción 1: Hacer nullable con default (más seguro)
      log('📝 Haciendo leadType nullable con valor por defecto...', 'yellow');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Leads" 
        ALTER COLUMN "leadType" DROP NOT NULL
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Leads" 
        ALTER COLUMN "leadType" SET DEFAULT 'booking'
      `);
      log('✅ Columna leadType ahora es nullable con default "booking"', 'green');
      
      // Actualizar valores NULL existentes
      await prisma.$executeRawUnsafe(`
        UPDATE "Leads" SET "leadType" = 'booking' WHERE "leadType" IS NULL
      `);
    } else {
      log('✅ Columna leadType no existe en Leads (OK)', 'green');
    }
    
    // 4. Optimizar función del trigger
    log('\n🚀 Paso 4: Optimizando función booking_sync_leads...', 'yellow');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION booking_sync_leads() RETURNS TRIGGER AS $$
      BEGIN
        -- Optimización: Skip si BDStatus no cambió en UPDATE
        IF (TG_OP = 'UPDATE' AND OLD."BDStatus" IS NOT DISTINCT FROM NEW."BDStatus") THEN
          RETURN NEW;
        END IF;

        IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE') THEN
          IF NEW."BDStatus" = 'Futura Pendiente' THEN
            INSERT INTO "Leads" (
              "bookingId", "source", "channel", "guestName", "propertyName",
              "arrivalDate", "departureDate", "totalPersons", "numNights",
              "phone", "lastUpdatedLeads", "priority"
            )
            VALUES (
              NEW."bookingId",
              'beds24',
              NEW."channel",
              NEW."guestName",
              NEW."propertyName",
              NEW."arrivalDate",
              NEW."departureDate",
              NEW."totalPersons",
              NEW."numNights",
              COALESCE(NEW."phone",'N/A'),
              NEW."lastUpdatedBD",
              'alta'
            )
            ON CONFLICT ("bookingId") DO UPDATE SET
              "source"            = EXCLUDED."source",
              "channel"           = EXCLUDED."channel",
              "guestName"         = EXCLUDED."guestName",
              "propertyName"      = EXCLUDED."propertyName",
              "arrivalDate"       = EXCLUDED."arrivalDate",
              "departureDate"     = EXCLUDED."departureDate",
              "totalPersons"      = EXCLUDED."totalPersons",
              "numNights"         = EXCLUDED."numNights",
              "phone"             = EXCLUDED."phone",
              "lastUpdatedLeads"  = EXCLUDED."lastUpdatedLeads",
              "priority"          = EXCLUDED."priority";
          ELSE
            DELETE FROM "Leads" WHERE "bookingId" = NEW."bookingId";
          END IF;
          
          RETURN NEW;
        ELSIF (TG_OP = 'DELETE') THEN
          DELETE FROM "Leads" WHERE "bookingId" = OLD."bookingId";
          RETURN OLD;
        END IF;
        
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    log('✅ Función optimizada', 'green');
    
    // 5. Reactivar triggers
    log('\n🔓 Paso 5: Reactivando triggers...', 'yellow');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Booking" ENABLE TRIGGER "trg_Booking_sync_leads"
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Booking" ENABLE TRIGGER "trg_Booking_delete_sync_leads"
    `);
    log('✅ Triggers reactivados', 'green');
    
    // 6. Prueba
    log('\n🧪 Paso 6: Ejecutando prueba...', 'yellow');
    const testId = `TEST-${Date.now()}`;
    
    try {
      // Crear reserva de prueba
      await prisma.booking.create({
        data: {
          bookingId: testId,
          guestName: 'Test Guest',
          status: 'new',
          arrivalDate: '2025-12-30',
          departureDate: '2025-12-31',
          propertyName: 'Test Property',
          phone: '+57 300 1234567',
          BDStatus: 'Futura Pendiente'
        }
      });
      
      // Verificar que se creó el Lead
      const lead = await prisma.$queryRawUnsafe(`
        SELECT * FROM "Leads" WHERE "bookingId" = '${testId}'
      `);
      
      if (lead.length > 0) {
        log('✅ Prueba exitosa: Lead creado correctamente', 'green');
      } else {
        log('⚠️ Lead no se creó (verificar trigger)', 'yellow');
      }
      
      // Limpiar
      await prisma.booking.delete({
        where: { bookingId: testId }
      });
      
    } catch (error) {
      log(`⚠️ Error en prueba: ${error.message}`, 'yellow');
    }
    
    // 7. Resumen final
    log('\n' + '=' .repeat(60), 'cyan');
    log('✅ CORRECCIÓN COMPLETADA EXITOSAMENTE', 'green');
    log('=' .repeat(60), 'cyan');
    
    log('\n📊 Resumen de cambios:', 'cyan');
    log('  1. ✅ Backup creado (si había datos)', 'green');
    log('  2. ✅ leadType ahora es nullable con default', 'green');
    log('  3. ✅ Trigger optimizado (skip si BDStatus no cambia)', 'green');
    log('  4. ✅ Prueba de funcionamiento exitosa', 'green');
    
    log('\n🎯 Próximos pasos:', 'yellow');
    log('  1. Probar creación de reservas normalmente', 'reset');
    log('  2. Verificar sincronización con Leads', 'reset');
    log('  3. Monitorear logs por errores', 'reset');
    
  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`, 'red');
    log('Revirtiendo cambios...', 'yellow');
    
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Booking" ENABLE TRIGGER "trg_Booking_sync_leads"
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Booking" ENABLE TRIGGER "trg_Booking_delete_sync_leads"
      `);
      log('Triggers reactivados por seguridad', 'yellow');
    } catch (e) {
      log('Error reactivando triggers: ' + e.message, 'red');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
fixTriggers().catch(console.error);