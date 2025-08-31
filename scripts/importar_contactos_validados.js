#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function importarContactosValidados() {
  try {
    console.log('🚀 IMPORTACIÓN DE CONTACTOS VALIDADOS POR WHATSAPP');
    console.log('='*60);
    
    // Leer contactos validados
    const archivoContactos = path.join(__dirname, '../CONTACTOS_CON_WHATSAPP.json');
    const contactosValidados = JSON.parse(fs.readFileSync(archivoContactos, 'utf-8'));
    
    console.log(`📊 Total de contactos a importar: ${contactosValidados.length}`);
    
    // Primero, hacer backup de la tabla actual
    console.log('\n📦 Creando backup de la tabla Contactos...');
    const backupCount = await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Contactos_backup_20250110" AS 
      SELECT * FROM "Contactos"
    `;
    
    // Limpiar la tabla Contactos actual
    console.log('\n🗑️ Limpiando tabla Contactos...');
    const deletedCount = await prisma.contactos.deleteMany({});
    console.log(`   Eliminados: ${deletedCount.count} registros antiguos`);
    
    // Importar contactos validados en lotes
    console.log('\n📥 Importando contactos validados...');
    const batchSize = 100;
    let importados = 0;
    let errores = 0;
    
    for (let i = 0; i < contactosValidados.length; i += batchSize) {
      const batch = contactosValidados.slice(i, i + batchSize);
      
      try {
        await prisma.contactos.createMany({
          data: batch.map(contacto => ({
            phoneNumber: contacto.telefono,
            name: contacto.nombre || null,
            email: null, // No tenemos emails en estos datos
            whatsappLabels: null,
            lastWhatsappMsg: null,
            hasWhatsapp: true, // Todos estos tienen WhatsApp confirmado
            totalBookings: 0,
            confirmedBookings: 0,
            pendingBookings: 0,
            cancelledBookings: 0,
            lastCheckIn: null,
            nextCheckIn: null,
            totalSpent: 0,
            lastActivity: new Date(),
            source: ['whapi_validated', 'import_20250110'],
            status: 'active'
          })),
          skipDuplicates: true
        });
        
        importados += batch.length;
        
        // Mostrar progreso
        if (importados % 500 === 0) {
          console.log(`   ✅ Importados: ${importados}/${contactosValidados.length}`);
        }
      } catch (error) {
        console.error(`   ❌ Error en lote ${i/batchSize}: ${error.message}`);
        errores += batch.length;
      }
    }
    
    console.log(`\n✅ Importación completada: ${importados} contactos`);
    if (errores > 0) {
      console.log(`⚠️  Contactos con error: ${errores}`);
    }
    
    // Verificar totales
    const totalEnBD = await prisma.contactos.count();
    console.log(`\n📊 VERIFICACIÓN FINAL:`);
    console.log(`   Total en BD: ${totalEnBD}`);
    console.log(`   Esperados: ${contactosValidados.length}`);
    console.log(`   Diferencia: ${totalEnBD - contactosValidados.length}`);
    
    // Estadísticas por país (basado en prefijo)
    const estadisticas = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN "phoneNumber" LIKE '+57%' THEN 'Colombia'
          WHEN "phoneNumber" LIKE '+1%' THEN 'USA/Canadá'
          WHEN "phoneNumber" LIKE '+52%' THEN 'México'
          WHEN "phoneNumber" LIKE '+54%' THEN 'Argentina'
          WHEN "phoneNumber" LIKE '+34%' THEN 'España'
          WHEN "phoneNumber" LIKE '+44%' THEN 'Reino Unido'
          WHEN "phoneNumber" LIKE '+55%' THEN 'Brasil'
          WHEN "phoneNumber" LIKE '+51%' THEN 'Perú'
          ELSE 'Otros'
        END as pais,
        COUNT(*) as total
      FROM "Contactos"
      GROUP BY pais
      ORDER BY total DESC
      LIMIT 10
    `;
    
    console.log('\n🌍 DISTRIBUCIÓN POR PAÍS:');
    estadisticas.forEach(stat => {
      console.log(`   ${stat.pais}: ${stat.total} contactos`);
    });
    
    console.log('\n✅ PROCESO COMPLETADO EXITOSAMENTE');
    console.log('Los contactos sin WhatsApp han sido eliminados');
    console.log('La tabla Contactos ahora solo contiene números válidos de WhatsApp');
    
  } catch (error) {
    console.error('❌ Error general:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
importarContactosValidados();