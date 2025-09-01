import { google } from 'googleapis';
import { PrismaClient } from '../data-sync/node_modules/@prisma/client/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Configuración
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../data-sync/.env') });

const prisma = new PrismaClient();
const people = google.people('v1');

// Archivo de logs
const LOG_FILE = path.join(__dirname, 'sync-log.txt');

// Estadísticas
let stats = {
  bdToGoogle: { exitos: 0, errores: 0 },
  googleToBd: { exitos: 0, errores: 0 }
};

// ============================================
// UTILIDADES
// ============================================

function log(mensaje) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${mensaje}\n`;
  console.log(mensaje);
  fs.appendFileSync(LOG_FILE, logEntry);
}

function normalizarTelefono(telefono) {
  if (!telefono) return null;
  
  // Remover caracteres no numéricos
  let normalizado = telefono.replace(/\D/g, '');
  
  // Asegurar que empiece con +
  if (!normalizado.startsWith('+')) {
    // Si es colombiano y no tiene código de país
    if (normalizado.length === 10 && normalizado.startsWith('3')) {
      normalizado = '57' + normalizado;
    }
    normalizado = '+' + normalizado;
  } else {
    normalizado = '+' + normalizado.substring(1);
  }
  
  return normalizado;
}

function generarNotaUnificada(cliente) {
  const partes = [];
  
  // Etiquetas
  if (cliente.etiquetas && cliente.etiquetas.length > 0) {
    partes.push(cliente.etiquetas.join(', '));
  }
  
  // Estado
  if (cliente.estado) {
    partes.push(cliente.estado);
  }
  
  // Fecha de última actividad
  if (cliente.ultimaActividad) {
    const fecha = new Date(cliente.ultimaActividad);
    partes.push(fecha.toLocaleDateString('es-CO'));
  }
  
  // Total de reservas
  if (cliente.totalReservas > 0) {
    partes.push(`${cliente.totalReservas} reservas`);
  }
  
  // Nota principal
  if (cliente.notas && typeof cliente.notas === 'object') {
    if (cliente.notas.importacion) {
      partes.push(cliente.notas.importacion);
    } else if (cliente.notas.reservas_notes) {
      partes.push(cliente.notas.reservas_notes);
    }
  }
  
  return partes.filter(p => p).join(' / ');
}

// ============================================
// AUTENTICACIÓN GOOGLE
// ============================================

async function autenticarGoogle() {
  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3000/callback'
    );
    
    // Leer token guardado
    const tokenPath = path.join(__dirname, 'token.json');
    if (fs.existsSync(tokenPath)) {
      const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      auth.setCredentials(token);
      google.options({ auth });
      return auth;
    } else {
      throw new Error('No hay token de autenticación. Ejecuta setup-google-auth.js primero');
    }
  } catch (error) {
    log(`❌ Error de autenticación: ${error.message}`);
    throw error;
  }
}

// ============================================
// BD → GOOGLE (Nuevos contactos)
// ============================================

async function syncNuevosAGoogle() {
  log('📤 Sincronizando BD → Google...');
  
  try {
    // Obtener clientes sin googleResourceId
    const nuevos = await prisma.clientes.findMany({
      where: { 
        googleResourceId: null
      },
      take: 50 // Procesar en lotes de 50
    });
    
    log(`   Encontrados ${nuevos.length} contactos nuevos para Google`);
    
    for (const cliente of nuevos) {
      try {
        const telefonoNormalizado = normalizarTelefono(cliente.telefono);
        if (!telefonoNormalizado) continue;
        
        // Crear contacto en Google
        const response = await people.people.createContact({
          requestBody: {
            names: [{ 
              givenName: cliente.nombre || 'Sin nombre',
              displayName: cliente.nombre || 'Sin nombre'
            }],
            phoneNumbers: [{ 
              value: telefonoNormalizado,
              type: 'mobile'
            }],
            biographies: [{ 
              value: generarNotaUnificada(cliente),
              contentType: 'TEXT_PLAIN'
            }]
          }
        });
        
        // Guardar ID de Google en BD
        await prisma.clientes.update({
          where: { id: cliente.id },
          data: { 
            googleResourceId: response.data.resourceName 
          }
        });
        
        stats.bdToGoogle.exitos++;
        log(`   ✅ ${cliente.nombre || 'Sin nombre'} → Google`);
        
      } catch (error) {
        stats.bdToGoogle.errores++;
        log(`   ❌ Error con ${cliente.telefono}: ${error.message}`);
      }
    }
    
  } catch (error) {
    log(`❌ Error general BD→Google: ${error.message}`);
  }
}

// ============================================
// GOOGLE → BD (Importar nuevos)
// ============================================

async function importarDesdeGoogle() {
  log('📥 Importando Google → BD...');
  
  try {
    let pageToken = null;
    let totalProcesados = 0;
    
    // Procesar todas las páginas
    do {
      const response = await people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        pageToken: pageToken,
        personFields: 'names,phoneNumbers,biographies,metadata'
      });
      
      const contactos = response.data.connections || [];
      totalProcesados += contactos.length;
      
      for (const contacto of contactos) {
        try {
          // Extraer y normalizar teléfono
          const telefonoRaw = contacto.phoneNumbers?.[0]?.value;
          if (!telefonoRaw) continue;
          
          const telefonoNormalizado = normalizarTelefono(telefonoRaw);
          if (!telefonoNormalizado) continue;
          
          // Verificar si ya existe en BD
          const existe = await prisma.clientes.findFirst({
            where: { 
              telefono: telefonoNormalizado
            }
          });
          
          if (!existe) {
            // Extraer nombre
            const nombre = contacto.names?.[0]?.displayName || 
                          contacto.names?.[0]?.givenName || 
                          'Sin nombre';
            
            // Extraer notas
            const notaGoogle = contacto.biographies?.[0]?.value || '';
            
            // Crear nuevo cliente
            await prisma.clientes.create({
              data: {
                telefono: telefonoNormalizado,
                nombre: nombre,
                notas: notaGoogle ? { google_notes: notaGoogle } : {},
                googleResourceId: contacto.resourceName,
                estado: null,
                totalReservas: 0,
                etiquetas: []
              }
            });
            
            stats.googleToBd.exitos++;
            log(`   ✅ Google → BD: ${nombre} (${telefonoNormalizado})`);
          }
          
        } catch (error) {
          stats.googleToBd.errores++;
          log(`   ❌ Error importando contacto: ${error.message}`);
        }
      }
      
      // Siguiente página
      pageToken = response.data.nextPageToken;
      
    } while (pageToken);
    
    log(`   Total contactos procesados de Google: ${totalProcesados}`);
    
  } catch (error) {
    log(`❌ Error general Google→BD: ${error.message}`);
  }
}

// ============================================
// FUNCIÓN PRINCIPAL
// ============================================

async function main() {
  const inicioSync = new Date();
  log('========================================');
  log('🔄 INICIANDO SINCRONIZACIÓN BD ↔️ GOOGLE');
  
  try {
    // Autenticar con Google
    await autenticarGoogle();
    
    // Resetear estadísticas
    stats = {
      bdToGoogle: { exitos: 0, errores: 0 },
      googleToBd: { exitos: 0, errores: 0 }
    };
    
    // 1. BD → Google (nuevos)
    await syncNuevosAGoogle();
    
    // 2. Google → BD (nuevos)
    await importarDesdeGoogle();
    
    // Resumen
    const duracion = ((new Date() - inicioSync) / 1000).toFixed(2);
    log('');
    log('📊 RESUMEN DE SINCRONIZACIÓN:');
    log(`   BD → Google: ${stats.bdToGoogle.exitos} éxitos, ${stats.bdToGoogle.errores} errores`);
    log(`   Google → BD: ${stats.googleToBd.exitos} éxitos, ${stats.googleToBd.errores} errores`);
    log(`   Duración: ${duracion} segundos`);
    log('✅ SINCRONIZACIÓN COMPLETADA');
    log('========================================\n');
    
  } catch (error) {
    log(`❌ ERROR FATAL: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar si es llamado directamente
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    log(`❌ Error no capturado: ${error.message}`);
    process.exit(1);
  });
}

export { main, normalizarTelefono, generarNotaUnificada };