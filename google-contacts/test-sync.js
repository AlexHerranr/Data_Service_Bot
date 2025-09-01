import { PrismaClient } from '../data-sync/node_modules/@prisma/client/index.js';
import { normalizarTelefono, generarNotaUnificada } from './sync-google.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function testSync() {
  console.log('🧪 TEST DE SINCRONIZACIÓN BD ↔️ GOOGLE');
  console.log('=====================================\n');
  
  try {
    // 1. Verificar token de Google
    console.log('1️⃣ Verificando autenticación Google...');
    const tokenPath = path.join(__dirname, 'token.json');
    if (fs.existsSync(tokenPath)) {
      console.log('   ✅ Token encontrado');
    } else {
      console.log('   ❌ Token NO encontrado');
      console.log('   Ejecuta: node /workspace/google-contacts/get-auth-url.js');
      return;
    }
    
    // 2. Verificar conexión BD
    console.log('\n2️⃣ Verificando conexión a BD...');
    const count = await prisma.clientes.count();
    console.log(`   ✅ BD conectada - ${count} clientes totales`);
    
    // 3. Verificar clientes sin Google ID
    console.log('\n3️⃣ Analizando clientes para sincronizar...');
    const sinGoogle = await prisma.clientes.count({
      where: { 
        googleResourceId: null
      }
    });
    console.log(`   📊 Clientes sin sincronizar: ${sinGoogle}`);
    
    // 4. Mostrar ejemplos de normalización
    console.log('\n4️⃣ Ejemplos de normalización de teléfonos:');
    const ejemplos = [
      '3214126449',
      '573214126449',
      '+573214126449',
      '321-412-6449',
      '(321) 412-6449'
    ];
    
    ejemplos.forEach(tel => {
      console.log(`   ${tel} → ${normalizarTelefono(tel)}`);
    });
    
    // 5. Ejemplo de nota unificada
    console.log('\n5️⃣ Ejemplo de nota unificada:');
    
    const clienteEjemplo = await prisma.clientes.findFirst({
      where: {
        totalReservas: { gt: 0 },
        notas: { not: {} }
      }
    });
    
    if (clienteEjemplo) {
      console.log(`   Cliente: ${clienteEjemplo.nombre}`);
      console.log(`   Nota generada: "${generarNotaUnificada(clienteEjemplo)}"`);
    } else {
      console.log('   No hay clientes con datos completos para ejemplo');
    }
    
    // 6. Verificar primeros 5 para sincronizar
    console.log('\n6️⃣ Primeros 5 clientes a sincronizar:');
    
    const primeros5 = await prisma.clientes.findMany({
      where: { 
        googleResourceId: null
      },
      take: 5,
      select: {
        nombre: true,
        telefono: true,
        estado: true,
        totalReservas: true,
        etiquetas: true,
        notas: true,
        ultimaActividad: true
      }
    });
    
    primeros5.forEach((c, i) => {
      console.log(`   ${i+1}. ${c.nombre || 'Sin nombre'}`);
      console.log(`      Tel: ${c.telefono}`);
      console.log(`      Estado: ${c.estado || 'N/A'} | Reservas: ${c.totalReservas}`);
      console.log(`      Nota: "${generarNotaUnificada(c)}"`);
    });
    
    // 7. Preguntar si ejecutar sincronización
    console.log('\n' + '='.repeat(50));
    console.log('✅ TEST COMPLETADO - Sistema listo para sincronizar');
    console.log('\nPara ejecutar sincronización completa:');
    console.log('   node /workspace/google-contacts/sync-google.js');
    console.log('\nPara configurar cron automático:');
    console.log('   /workspace/google-contacts/setup-cron.sh');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testSync();