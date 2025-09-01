#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function limpiarContactosSinWhatsApp() {
  try {
    console.log('🔍 LIMPIEZA DE CONTACTOS SIN WHATSAPP');
    console.log('='*60);
    
    // PASO 1: Leer el archivo de resultados de Whapi
    // Asumiendo que Whapi devuelve un CSV con los números que SÍ tienen WhatsApp
    const archivoWhapi = path.join(__dirname, '../numeros_con_whatsapp.csv');
    
    if (!fs.existsSync(archivoWhapi)) {
      console.log('⚠️  Archivo de resultados de Whapi no encontrado.');
      console.log('   Por favor, coloca el archivo: numeros_con_whatsapp.csv');
      return;
    }
    
    // Leer números válidos de WhatsApp
    const contenidoWhapi = fs.readFileSync(archivoWhapi, 'utf-8');
    const numerosConWhatsApp = new Set();
    
    contenidoWhapi.split('\n').forEach(linea => {
      const numero = linea.trim();
      if (numero) {
        // Agregar con y sin el símbolo +
        numerosConWhatsApp.add(numero);
        numerosConWhatsApp.add('+' + numero);
      }
    });
    
    console.log(`✅ Números con WhatsApp: ${numerosConWhatsApp.size}`);
    
    // PASO 2: Leer contactos actuales del JSON
    const archivoContactos = path.join(__dirname, '../CONTACTOS_FINALES_SIN_A.json');
    const contactosOriginales = JSON.parse(fs.readFileSync(archivoContactos, 'utf-8'));
    
    console.log(`📊 Total contactos originales: ${contactosOriginales.length}`);
    
    // PASO 3: Filtrar solo los que tienen WhatsApp
    const contactosConWhatsApp = contactosOriginales.filter(contacto => {
      return numerosConWhatsApp.has(contacto.telefono) || 
             numerosConWhatsApp.has(contacto.telefono.replace('+', ''));
    });
    
    const contactosSinWhatsApp = contactosOriginales.filter(contacto => {
      return !numerosConWhatsApp.has(contacto.telefono) && 
             !numerosConWhatsApp.has(contacto.telefono.replace('+', ''));
    });
    
    console.log(`✅ Contactos CON WhatsApp: ${contactosConWhatsApp.length}`);
    console.log(`❌ Contactos SIN WhatsApp: ${contactosSinWhatsApp.length}`);
    
    // PASO 4: Guardar nuevo JSON solo con contactos válidos
    const archivoFinal = path.join(__dirname, '../CONTACTOS_VALIDADOS_WHATSAPP.json');
    fs.writeFileSync(archivoFinal, JSON.stringify(contactosConWhatsApp, null, 2));
    console.log(`\n📁 Archivo guardado: CONTACTOS_VALIDADOS_WHATSAPP.json`);
    
    // Guardar lista de excluidos para referencia
    const archivoExcluidos = path.join(__dirname, '../CONTACTOS_SIN_WHATSAPP.json');
    fs.writeFileSync(archivoExcluidos, JSON.stringify(contactosSinWhatsApp, null, 2));
    console.log(`📁 Archivo de excluidos: CONTACTOS_SIN_WHATSAPP.json`);
    
    // PASO 5: Limpiar base de datos
    console.log('\n🗄️  LIMPIANDO BASE DE DATOS...');
    
    // Obtener números a eliminar
    const numerosAEliminar = contactosSinWhatsApp.map(c => c.telefono);
    
    if (numerosAEliminar.length > 0) {
      // Eliminar de la tabla Contactos
      const resultadoContactos = await prisma.contactos.deleteMany({
        where: {
          phoneNumber: {
            in: numerosAEliminar
          }
        }
      });
      console.log(`✅ Eliminados de Contactos: ${resultadoContactos.count} registros`);
      
      // Eliminar de ClientView si existe
      const resultadoClientView = await prisma.clientView.deleteMany({
        where: {
          phoneNumber: {
            in: numerosAEliminar
          }
        }
      });
      console.log(`✅ Eliminados de ClientView: ${resultadoClientView.count} registros`);
      
      // Eliminar de IA_CRM_Clientes
      const resultadoCRM = await prisma.iA_CRM_Clientes.deleteMany({
        where: {
          phoneNumber: {
            in: numerosAEliminar
          }
        }
      });
      console.log(`✅ Eliminados de IA_CRM_Clientes: ${resultadoCRM.count} registros`);
    }
    
    // PASO 6: Resumen final
    console.log('\n📊 RESUMEN FINAL:');
    console.log('='*60);
    console.log(`Contactos originales:     ${contactosOriginales.length}`);
    console.log(`Contactos con WhatsApp:   ${contactosConWhatsApp.length}`);
    console.log(`Contactos eliminados:     ${contactosSinWhatsApp.length}`);
    console.log(`Porcentaje válido:        ${((contactosConWhatsApp.length/contactosOriginales.length)*100).toFixed(1)}%`);
    
    // Mostrar algunos ejemplos de eliminados
    if (contactosSinWhatsApp.length > 0) {
      console.log('\n❌ Ejemplos de contactos eliminados:');
      contactosSinWhatsApp.slice(0, 10).forEach((c, i) => {
        console.log(`   ${i+1}. ${c.nombre || 'Sin nombre'} - ${c.telefono}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
limpiarContactosSinWhatsApp();