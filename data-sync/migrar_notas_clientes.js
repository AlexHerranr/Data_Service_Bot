import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function migrarNotasDesdeJSON() {
  try {
    console.log('🔄 MIGRACIÓN DE NOTAS DESDE JSON A CLIENTES');
    console.log('='*60);
    
    // 1. Leer el archivo de contactos con notas
    const archivoContactos = path.join(__dirname, '../CONTACTOS_CON_WHATSAPP.json');
    
    if (!fs.existsSync(archivoContactos)) {
      console.log('❌ No se encontró CONTACTOS_CON_WHATSAPP.json');
      return;
    }
    
    const contactos = JSON.parse(fs.readFileSync(archivoContactos, 'utf-8'));
    console.log(`📊 Total de contactos a procesar: ${contactos.length}`);
    
    // 2. Estadísticas
    let conNotas = 0;
    let sinNotas = 0;
    let actualizados = 0;
    let creados = 0;
    let errores = 0;
    
    // 3. Procesar cada contacto
    console.log('\n📝 Procesando contactos...');
    
    for (let i = 0; i < contactos.length; i++) {
      const contacto = contactos[i];
      
      try {
        // Preparar objeto de notas
        const notasJSON = {};
        
        if (contacto.nota) {
          notasJSON.importacion = contacto.nota;
          conNotas++;
        } else {
          sinNotas++;
        }
        
        // Extraer etiquetas de la nota si existen
        const etiquetas = [];
        if (contacto.nota) {
          // Extraer años
          const años = contacto.nota.match(/\b20\d{2}\b/g);
          if (años) {
            años.forEach(año => etiquetas.push(`cliente_${año}`));
          }
          
          // Extraer apartamentos
          if (contacto.nota.includes('Apt')) {
            etiquetas.push('con_reserva');
            const apt = contacto.nota.match(/Apt\s+(\w+)/);
            if (apt) {
              etiquetas.push(`apt_${apt[1]}`);
            }
          }
          
          // Otros patrones
          if (contacto.nota.toLowerCase().includes('reservó')) {
            etiquetas.push('historial_reserva');
          }
        }
        
        // Upsert en la base de datos
        const resultado = await prisma.clientes.upsert({
          where: { 
            telefono: contacto.telefono 
          },
          update: {
            nombre: contacto.nombre || undefined,
            notas: notasJSON,
            etiquetas: etiquetas.length > 0 ? etiquetas : undefined,
            actualizadoEn: new Date()
          },
          create: {
            telefono: contacto.telefono,
            nombre: contacto.nombre,
            notas: notasJSON,
            etiquetas: etiquetas,
            totalReservas: 0,
            estado: 'importado',
            creadoEn: new Date()
          }
        });
        
        if (resultado) {
          actualizados++;
        }
        
      } catch (error) {
        errores++;
        console.error(`❌ Error con ${contacto.telefono}: ${error.message}`);
      }
      
      // Mostrar progreso
      if ((i + 1) % 500 === 0) {
        console.log(`   Procesados: ${i + 1}/${contactos.length}`);
      }
    }
    
    // 4. Estadísticas finales
    console.log('\n📊 RESUMEN DE MIGRACIÓN:');
    console.log(`   Total procesados:    ${contactos.length}`);
    console.log(`   Con notas:          ${conNotas}`);
    console.log(`   Sin notas:          ${sinNotas}`);
    console.log(`   Actualizados en BD: ${actualizados}`);
    console.log(`   Errores:            ${errores}`);
    
    // 5. Verificar algunos ejemplos
    console.log('\n📝 EJEMPLOS DE NOTAS MIGRADAS:');
    
    const ejemplos = await prisma.clientes.findMany({
      where: {
        notas: {
          path: ['importacion'],
          not: null
        }
      },
      take: 5,
      select: {
        telefono: true,
        nombre: true,
        notas: true,
        etiquetas: true
      }
    });
    
    ejemplos.forEach((ej, i) => {
      console.log(`\n${i + 1}. ${ej.nombre || 'Sin nombre'} - ${ej.telefono}`);
      console.log(`   Nota: ${ej.notas?.importacion || 'N/A'}`);
      console.log(`   Etiquetas: ${ej.etiquetas?.join(', ') || 'Ninguna'}`);
    });
    
    // 6. Actualizar contadores de reservas
    console.log('\n🔄 Actualizando contadores de reservas...');
    
    const actualizado = await prisma.$executeRaw`
      UPDATE "Clientes" c
      SET total_reservas = (
        SELECT COUNT(*) 
        FROM "Reservas" r 
        WHERE r.phone = c.telefono
      )
      WHERE EXISTS (
        SELECT 1 FROM "Reservas" r WHERE r.phone = c.telefono
      )
    `;
    
    console.log(`   ✅ Contadores actualizados: ${actualizado} clientes`);
    
    // 7. Actualizar última actividad
    console.log('\n🔄 Actualizando última actividad...');
    
    const actividadActualizada = await prisma.$executeRaw`
      UPDATE "Clientes" c
      SET ultima_actividad = GREATEST(
        (SELECT MAX("modifiedDate"::timestamp) FROM "Reservas" WHERE phone = c.telefono),
        (SELECT MAX("lastActivity") FROM "Chats" WHERE "phoneNumber" = c.telefono),
        c.actualizado_en
      )
    `;
    
    console.log(`   ✅ Última actividad actualizada: ${actividadActualizada} clientes`);
    
    console.log('\n✅ MIGRACIÓN COMPLETADA');
    
  } catch (error) {
    console.error('❌ Error general:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Script de prueba para verificar estructura
async function verificarEstructura() {
  try {
    console.log('\n🔍 VERIFICANDO ESTRUCTURA DE TABLA CLIENTES:');
    
    // Obtener un registro de ejemplo
    const ejemplo = await prisma.clientes.findFirst();
    
    if (ejemplo) {
      console.log('\n📋 Columnas disponibles:');
      Object.keys(ejemplo).forEach(columna => {
        const valor = ejemplo[columna];
        const tipo = Array.isArray(valor) ? 'Array' : typeof valor;
        console.log(`   • ${columna}: ${tipo}`);
      });
      
      console.log('\n📝 Ejemplo de registro:');
      console.log(JSON.stringify(ejemplo, null, 2));
    } else {
      console.log('No hay registros en la tabla Clientes');
    }
    
  } catch (error) {
    console.error('Error verificando estructura:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Menú de opciones
const opcion = process.argv[2];

if (opcion === '--verificar') {
  verificarEstructura();
} else {
  console.log('Iniciando migración en 3 segundos...');
  console.log('(Presiona Ctrl+C para cancelar)\n');
  setTimeout(() => {
    migrarNotasDesdeJSON();
  }, 3000);
}