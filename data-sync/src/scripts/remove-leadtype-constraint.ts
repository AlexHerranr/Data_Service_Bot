/**
 * Script para eliminar el constraint de leadType de la tabla Booking
 * Este campo es obsoleto y está causando errores en las inserciones
 */

import { prisma } from '../infra/db/prisma.client.js';
import { logger } from '../utils/logger.js';

async function removeLeadTypeConstraint() {
  logger.info('🔧 INICIANDO ELIMINACIÓN DE CONSTRAINT leadType');
  logger.info('=' .repeat(60));

  try {
    // Primero, verificar si la columna existe
    logger.info('📊 Verificando estructura de la tabla Booking...');
    
    const checkColumn = await prisma.$queryRaw`
      SELECT column_name, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'Booking' 
      AND column_name = 'leadType'
    ` as any[];
    
    if (checkColumn.length > 0) {
      logger.info('⚠️ Columna leadType encontrada:', checkColumn[0]);
      
      // Intentar eliminar la columna
      logger.info('🗑️ Intentando eliminar la columna leadType...');
      
      try {
        await prisma.$executeRaw`ALTER TABLE "Booking" DROP COLUMN IF EXISTS "leadType"`;
        logger.info('✅ Columna leadType eliminada exitosamente');
      } catch (dropError: any) {
        logger.warn(`⚠️ No se pudo eliminar la columna: ${dropError.message}`);
        
        // Si no se puede eliminar, intentar hacerla nullable
        logger.info('🔄 Intentando hacer la columna nullable...');
        try {
          await prisma.$executeRaw`ALTER TABLE "Booking" ALTER COLUMN "leadType" DROP NOT NULL`;
          logger.info('✅ Constraint NOT NULL removido de leadType');
        } catch (nullError: any) {
          logger.warn(`⚠️ No se pudo modificar el constraint: ${nullError.message}`);
        }
      }
    } else {
      logger.info('✅ La columna leadType no existe en la tabla Booking');
    }

    // Verificar constraints
    logger.info('🔍 Verificando constraints de la tabla...');
    
    const constraints = await prisma.$queryRaw`
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'Booking'
      AND kcu.column_name = 'leadType'
    ` as any[];
    
    if (constraints.length > 0) {
      logger.info(`⚠️ Encontrados ${constraints.length} constraints relacionados con leadType`);
      
      for (const constraint of constraints) {
        logger.info(`🗑️ Eliminando constraint: ${constraint.constraint_name}`);
        try {
          await prisma.$executeRaw`ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS ${constraint.constraint_name}`;
          logger.info(`✅ Constraint ${constraint.constraint_name} eliminado`);
        } catch (error: any) {
          logger.warn(`⚠️ No se pudo eliminar ${constraint.constraint_name}: ${error.message}`);
        }
      }
    } else {
      logger.info('✅ No hay constraints relacionados con leadType');
    }

    // Verificar triggers que puedan requerir leadType
    logger.info('🔍 Verificando triggers...');
    
    const triggers = await prisma.$queryRaw`
      SELECT 
        trigger_name,
        event_manipulation,
        action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'Booking'
      AND action_statement LIKE '%leadType%'
    ` as any[];
    
    if (triggers.length > 0) {
      logger.warn(`⚠️ Encontrados ${triggers.length} triggers que mencionan leadType`);
      for (const trigger of triggers) {
        logger.warn(`  - ${trigger.trigger_name}: ${trigger.event_manipulation}`);
      }
      logger.info('💡 Estos triggers pueden necesitar ser actualizados manualmente');
    } else {
      logger.info('✅ No hay triggers que usen leadType');
    }

    // Verificar si hay valores en la columna (si existe)
    if (checkColumn.length > 0) {
      const countWithValues = await prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM "Booking" 
        WHERE "leadType" IS NOT NULL
      ` as any[];
      
      logger.info(`📊 Registros con leadType no nulo: ${countWithValues[0].count}`);
      
      // Si hay valores, actualizar a NULL antes de eliminar
      if (countWithValues[0].count > 0) {
        logger.info('🔄 Actualizando valores de leadType a NULL...');
        await prisma.$executeRaw`UPDATE "Booking" SET "leadType" = NULL WHERE "leadType" IS NOT NULL`;
        logger.info('✅ Valores actualizados');
      }
    }

    // Verificación final
    logger.info('=' .repeat(60));
    logger.info('📊 VERIFICACIÓN FINAL:');
    
    const finalCheck = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Booking' 
      AND column_name = 'leadType'
    ` as any[];
    
    if (finalCheck.length === 0) {
      logger.info('✅ leadType ha sido completamente eliminado de la tabla Booking');
    } else {
      logger.warn('⚠️ leadType todavía existe pero debería estar nullable ahora');
    }

    // Test: Intentar insertar un registro sin leadType
    logger.info('🧪 Probando inserción sin leadType...');
    
    try {
      const testBooking = await prisma.reservas.create({
        data: {
          bookingId: `test-${Date.now()}`,
          guestName: 'Test Sin LeadType',
          status: 'test',
          phone: '000000000',
          arrivalDate: '2025-12-31',
          departureDate: '2026-01-01'
        }
      });
      
      logger.info(`✅ Inserción de prueba exitosa: ${testBooking.bookingId}`);
      
      // Limpiar el registro de prueba
      await prisma.reservas.delete({
        where: { bookingId: testBooking.bookingId }
      });
      logger.info('🧹 Registro de prueba eliminado');
      
    } catch (error: any) {
      logger.error('❌ Error en inserción de prueba:', error.message);
      logger.info('⚠️ Puede que aún existan constraints o triggers que requieran leadType');
    }

    logger.info('=' .repeat(60));
    logger.info('✅ PROCESO COMPLETADO');
    logger.info('💡 Si siguen habiendo errores, puede ser necesario:');
    logger.info('   1. Revisar y actualizar triggers manualmente');
    logger.info('   2. Regenerar el cliente de Prisma: npx prisma generate');
    logger.info('   3. Reiniciar el servicio data-sync');
    
  } catch (error: any) {
    logger.error('❌ Error crítico:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  removeLeadTypeConstraint()
    .then(() => {
      logger.info('✅ Script completado exitosamente');
      process.exit(0);
    })
    .catch(error => {
      logger.error('❌ Error fatal:', error);
      process.exit(1);
    });
}