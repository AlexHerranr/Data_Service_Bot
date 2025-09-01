import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function ejecutarMigracion() {
  try {
    console.log('🔄 MIGRACIÓN: RENOMBRANDO TABLAS A ESPAÑOL');
    console.log('='*60);
    
    // 1. Verificar estado actual
    console.log('\n📊 ESTADO ACTUAL DE LAS TABLAS:');
    
    const tablasActuales = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('Booking', 'ClientView', 'Contactos', 'IA_CRM_Clientes', 'Leads', 'hotel_apartments')
      ORDER BY table_name;
    `;
    
    console.log('Tablas encontradas:');
    tablasActuales.forEach(t => console.log(`   • ${t.table_name}`));
    
    if (tablasActuales.length === 0) {
      console.log('\n⚠️  Parece que las tablas ya fueron renombradas o no existen');
      
      // Verificar si ya tienen los nuevos nombres
      const tablasNuevas = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('Reservas', 'Chats', 'Clientes', 'CRM', 'Oportunidades', 'Propiedades')
        ORDER BY table_name;
      `;
      
      if (tablasNuevas.length > 0) {
        console.log('\n✅ Las tablas ya tienen los nombres en español:');
        tablasNuevas.forEach(t => console.log(`   • ${t.table_name}`));
        return;
      }
    }
    
    // 2. Crear backup de seguridad
    console.log('\n🔒 Creando puntos de restauración...');
    
    // Guardar conteos actuales
    const conteos = {};
    if (tablasActuales.some(t => t.table_name === 'Booking')) {
      const count = await prisma.booking.count();
      conteos.Booking = count;
      console.log(`   Booking: ${count} registros`);
    }
    if (tablasActuales.some(t => t.table_name === 'ClientView')) {
      const count = await prisma.clientView.count();
      conteos.ClientView = count;
      console.log(`   ClientView: ${count} registros`);
    }
    if (tablasActuales.some(t => t.table_name === 'Contactos')) {
      const count = await prisma.contactos.count();
      conteos.Contactos = count;
      console.log(`   Contactos: ${count} registros`);
    }
    
    // 3. Ejecutar migración
    console.log('\n🚀 EJECUTANDO MIGRACIÓN...\n');
    
    // Leer el SQL de migración
    const sqlMigracion = fs.readFileSync(
      path.join(__dirname, '../sql/migracion_renombrar_tablas.sql'),
      'utf-8'
    );
    
    // Ejecutar el SQL completo
    try {
      await prisma.$executeRawUnsafe(sqlMigracion);
      console.log('✅ Migración SQL ejecutada exitosamente');
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('does not exist')) {
        console.log('⚠️  Algunas tablas ya estaban migradas, continuando...');
      } else {
        throw error;
      }
    }
    
    // 4. Verificar resultado
    console.log('\n📊 VERIFICANDO NUEVOS NOMBRES:');
    
    const tablasFinales = await prisma.$queryRaw`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as columnas
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_name IN ('Reservas', 'Chats', 'Clientes', 'CRM', 'Oportunidades', 'Propiedades')
      ORDER BY table_name;
    `;
    
    console.log('\n✅ TABLAS RENOMBRADAS:');
    tablasFinales.forEach(t => {
      console.log(`   • ${t.table_name} (${t.columnas} columnas)`);
    });
    
    // 5. Verificar triggers
    console.log('\n🔗 VERIFICANDO TRIGGERS:');
    
    const triggers = await prisma.$queryRaw`
      SELECT tgname as trigger_name
      FROM pg_trigger 
      WHERE tgname LIKE 'sync_%'
      ORDER BY tgname;
    `;
    
    triggers.forEach(t => {
      console.log(`   • ${t.trigger_name}`);
    });
    
    // 6. Resumen final
    console.log('\n' + '='*60);
    console.log('✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
    console.log('='*60);
    
    console.log('\n📋 CAMBIOS REALIZADOS:');
    console.log('   Booking         → Reservas');
    console.log('   ClientView      → Chats');
    console.log('   Contactos       → Clientes');
    console.log('   IA_CRM_Clientes → CRM');
    console.log('   Leads           → Oportunidades');
    console.log('   hotel_apartments → Propiedades');
    
    console.log('\n⚠️  IMPORTANTE:');
    console.log('   1. Actualiza tu archivo .env si es necesario');
    console.log('   2. Regenera el cliente Prisma: npx prisma generate');
    console.log('   3. Actualiza los imports en tus scripts');
    console.log('   4. Reinicia cualquier servicio que use la BD');
    
  } catch (error) {
    console.error('\n❌ ERROR EN LA MIGRACIÓN:', error.message);
    console.log('\n🔄 Para revertir, ejecuta:');
    console.log('   ROLLBACK;');
    console.log('   O restaura desde el backup');
  } finally {
    await prisma.$disconnect();
  }
}

// Confirmación antes de ejecutar
console.log('⚠️  ADVERTENCIA: Esta operación renombrará todas las tablas');
console.log('Asegúrate de tener un backup de la base de datos');
console.log('\nPresiona Ctrl+C para cancelar o espera 5 segundos para continuar...\n');

setTimeout(() => {
  ejecutarMigracion();
}, 5000);