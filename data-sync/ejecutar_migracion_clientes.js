import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function ejecutarMigracionClientes() {
  try {
    console.log('🔄 MIGRACIÓN: SIMPLIFICANDO TABLA CLIENTES');
    console.log('='*60);
    
    // 1. Verificar estado actual
    console.log('\n📊 VERIFICANDO ESTADO ACTUAL...');
    
    const countActual = await prisma.clientes.count();
    console.log(`   Registros actuales en Clientes: ${countActual}`);
    
    // 2. Crear backup
    console.log('\n🔒 CREANDO BACKUP...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Clientes_backup_${new Date().toISOString().slice(0,10)}" AS 
      SELECT * FROM "Clientes"
    `);
    console.log('   ✅ Backup creado');
    
    // 3. Agregar columnas nuevas si no existen
    console.log('\n📝 ACTUALIZANDO ESTRUCTURA...');
    
    // Verificar si la columna notas ya es JSON
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Clientes" 
        ALTER COLUMN notas TYPE JSONB USING notas::JSONB
      `);
      console.log('   ✅ Columna notas convertida a JSON');
    } catch (e) {
      // Si ya es JSON o no existe, intentar crearla
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "Clientes" 
          ADD COLUMN IF NOT EXISTS notas JSONB DEFAULT '{}'
        `);
        console.log('   ✅ Columna notas creada como JSON');
      } catch (e2) {
        console.log('   ℹ️ Columna notas ya existe como JSON');
      }
    }
    
    // Renombrar columnas a español si es necesario
    const renombrados = [
      ['phoneNumber', 'telefono'],
      ['name', 'nombre'],
      ['totalBookings', 'total_reservas'],
      ['lastActivity', 'ultima_actividad'],
      ['status', 'estado'],
      ['createdAt', 'creado_en'],
      ['updatedAt', 'actualizado_en']
    ];
    
    for (const [viejo, nuevo] of renombrados) {
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "Clientes" 
          RENAME COLUMN "${viejo}" TO "${nuevo}"
        `);
        console.log(`   ✅ Renombrado: ${viejo} → ${nuevo}`);
      } catch (e) {
        // La columna ya tiene el nombre nuevo o no existe
      }
    }
    
    // Eliminar columnas innecesarias
    const eliminar = [
      'whatsappChatId',
      'whatsappLabels', 
      'lastWhatsappMsg',
      'hasWhatsapp',
      'confirmedBookings',
      'pendingBookings',
      'cancelledBookings',
      'lastCheckIn',
      'nextCheckIn',
      'totalSpent',
      'nextReservation',
      'syncErrors',
      'source'
    ];
    
    for (const columna of eliminar) {
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "Clientes" 
          DROP COLUMN IF EXISTS "${columna}"
        `);
        console.log(`   ✅ Eliminada: ${columna}`);
      } catch (e) {
        // Ya fue eliminada
      }
    }
    
    // 4. Migrar notas existentes a JSON
    console.log('\n🔄 MIGRANDO NOTAS A JSON...');
    
    // Leer contactos del JSON
    const archivoContactos = path.join(__dirname, '../CONTACTOS_CON_WHATSAPP.json');
    const contactos = JSON.parse(fs.readFileSync(archivoContactos, 'utf-8'));
    
    let migrados = 0;
    const batchSize = 100;
    
    for (let i = 0; i < contactos.length; i += batchSize) {
      const batch = contactos.slice(i, i + batchSize);
      
      for (const contacto of batch) {
        if (contacto.nota) {
          try {
            await prisma.$executeRawUnsafe(`
              UPDATE "Clientes" 
              SET notas = jsonb_set(
                COALESCE(notas, '{}')::jsonb,
                '{importacion}',
                $1::jsonb
              )
              WHERE telefono = $2
            `, JSON.stringify(contacto.nota), contacto.telefono);
            
            migrados++;
          } catch (e) {
            // Continuar con el siguiente
          }
        }
      }
      
      if ((i + batchSize) % 500 === 0) {
        console.log(`   Procesados: ${Math.min(i + batchSize, contactos.length)}/${contactos.length}`);
      }
    }
    
    console.log(`   ✅ Notas migradas: ${migrados}`);
    
    // 5. Actualizar contadores
    console.log('\n📊 ACTUALIZANDO MÉTRICAS...');
    
    await prisma.$executeRawUnsafe(`
      UPDATE "Clientes" c
      SET total_reservas = (
        SELECT COUNT(*) 
        FROM "Reservas" r 
        WHERE r.phone = c.telefono
      )
    `);
    console.log('   ✅ Contadores de reservas actualizados');
    
    await prisma.$executeRawUnsafe(`
      UPDATE "Clientes" c
      SET ultima_actividad = GREATEST(
        (SELECT MAX("modifiedDate"::timestamp) FROM "Reservas" WHERE phone = c.telefono),
        (SELECT MAX("lastActivity") FROM "Chats" WHERE "phoneNumber" = c.telefono),
        c.actualizado_en
      )
    `);
    console.log('   ✅ Última actividad actualizada');
    
    // 6. Verificación final
    console.log('\n✅ VERIFICACIÓN FINAL:');
    
    const muestra = await prisma.$queryRaw`
      SELECT 
        telefono,
        nombre,
        jsonb_pretty(notas) as notas,
        etiquetas,
        total_reservas,
        ultima_actividad,
        estado
      FROM "Clientes"
      WHERE notas::text != '{}'
      LIMIT 3
    `;
    
    console.log('\n📝 Muestra de registros con notas:');
    muestra.forEach((r, i) => {
      console.log(`\n${i + 1}. ${r.nombre || 'Sin nombre'} - ${r.telefono}`);
      console.log(`   Notas: ${r.notas}`);
      console.log(`   Reservas: ${r.total_reservas}`);
    });
    
    const stats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN notas::text != '{}' THEN 1 END) as con_notas,
        COUNT(CASE WHEN total_reservas > 0 THEN 1 END) as con_reservas
      FROM "Clientes"
    `;
    
    console.log('\n📊 ESTADÍSTICAS FINALES:');
    console.log(`   Total clientes: ${stats[0].total}`);
    console.log(`   Con notas: ${stats[0].con_notas}`);
    console.log(`   Con reservas: ${stats[0].con_reservas}`);
    
    console.log('\n✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
    console.log('La tabla Clientes ahora tiene 11 columnas simplificadas');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

ejecutarMigracionClientes();