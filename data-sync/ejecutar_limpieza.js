import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function ejecutarLimpieza() {
  try {
    console.log('🧹 LIMPIEZA DE CONTACTOS SIN WHATSAPP EN BD');
    console.log('='*60);
    
    // Leer los contactos a eliminar
    const contactosEliminar = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../CONTACTOS_ELIMINADOS_SIN_WHATSAPP.json'), 'utf-8')
    );
    
    console.log(`📊 Contactos a eliminar: ${contactosEliminar.length}`);
    
    // Extraer números de teléfono
    const numerosEliminar = contactosEliminar.map(c => c.telefono);
    
    // Verificar cuántos existen actualmente en cada tabla
    console.log('\n🔍 Verificando tablas antes de eliminar...');
    
    const enContactos = await prisma.contactos.count({
      where: {
        phoneNumber: {
          in: numerosEliminar
        }
      }
    });
    
    const enCRM = await prisma.iA_CRM_Clientes.count({
      where: {
        phoneNumber: {
          in: numerosEliminar
        }
      }
    });
    
    console.log(`   En Contactos: ${enContactos}`);
    console.log(`   En IA_CRM_Clientes: ${enCRM}`);
    
    if (enContactos === 0 && enCRM === 0) {
      console.log('\n✅ No hay contactos para eliminar (ya fueron limpiados)');
      
      // Mostrar estadísticas actuales
      const totalContactos = await prisma.contactos.count();
      const conWhatsApp = await prisma.contactos.count({
        where: { hasWhatsapp: true }
      });
      
      console.log('\n📊 ESTADÍSTICAS ACTUALES:');
      console.log(`   Total en Contactos: ${totalContactos}`);
      console.log(`   Con WhatsApp: ${conWhatsApp}`);
      console.log(`   Porcentaje válido: ${((conWhatsApp/totalContactos)*100).toFixed(1)}%`);
      
    } else {
      // Proceder con la eliminación
      console.log('\n🗑️ Eliminando contactos sin WhatsApp...');
      
      // Eliminar de Contactos
      if (enContactos > 0) {
        const deletedContactos = await prisma.contactos.deleteMany({
          where: {
            phoneNumber: {
              in: numerosEliminar
            }
          }
        });
        console.log(`   ✅ Eliminados de Contactos: ${deletedContactos.count}`);
      }
      
      // Eliminar de IA_CRM_Clientes
      if (enCRM > 0) {
        const deletedCRM = await prisma.iA_CRM_Clientes.deleteMany({
          where: {
            phoneNumber: {
              in: numerosEliminar
            }
          }
        });
        console.log(`   ✅ Eliminados de IA_CRM_Clientes: ${deletedCRM.count}`);
      }
      
      console.log('\n✅ LIMPIEZA COMPLETADA');
    }
    
    // Verificación final
    console.log('\n📊 VERIFICACIÓN FINAL:');
    const finalContactos = await prisma.contactos.count();
    const finalCRM = await prisma.iA_CRM_Clientes.count();
    const finalClientView = await prisma.clientView.count();
    
    console.log(`   Contactos: ${finalContactos}`);
    console.log(`   IA_CRM_Clientes: ${finalCRM}`);
    console.log(`   ClientView: ${finalClientView} (no modificado)`);
    
    // Análisis de fuentes
    const conBooking = await prisma.$queryRaw`
      SELECT COUNT(*) as total 
      FROM "Contactos" 
      WHERE 'booking' = ANY(source)
    `;
    
    const conWhatsApp = await prisma.$queryRaw`
      SELECT COUNT(*) as total 
      FROM "Contactos" 
      WHERE 'whatsapp' = ANY(source)
    `;
    
    console.log('\n📈 ANÁLISIS DE FUENTES:');
    console.log(`   Con fuente Booking: ${conBooking[0]?.total || 0}`);
    console.log(`   Con fuente WhatsApp: ${conWhatsApp[0]?.total || 0}`);
    console.log(`   Total validados: ${finalContactos}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

ejecutarLimpieza();