#!/usr/bin/env node

/**
 * Script para descargar logs completos de Railway deployment
 * Uso: node scripts/download-railway-logs.js [opciones]
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const LOG_DIR = path.join(__dirname, '..', 'logs', 'railway');
const MAX_CHUNKS = 25; // Máximo número de chunks a mantener (más archivos para logs detallados)

// Crear directorio si no existe
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Función para limpiar chunks antiguos
function cleanupOldChunks() {
    try {
        const files = fs.readdirSync(LOG_DIR)
            .filter(file => file.startsWith('railway-logs-') && file.endsWith('.log'))
            .map(file => ({
                name: file,
                path: path.join(LOG_DIR, file),
                stats: fs.statSync(path.join(LOG_DIR, file))
            }))
            .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

        if (files.length > MAX_CHUNKS) {
            const filesToDelete = files.slice(MAX_CHUNKS);
            filesToDelete.forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                    console.log(`🗑️ Chunk antiguo eliminado: ${file.name}`);
                } catch (error) {
                    console.error(`Error eliminando ${file.name}:`, error.message);
                }
            });
        }
    } catch (error) {
        console.error('Error limpiando chunks antiguos:', error.message);
    }
}

// Función principal para descargar todos los logs del deployment
async function downloadAllRailwayLogs() {
    try {
        console.log(`📥 Descargando TODOS los logs del deployment actual...`);
        
        // Limpiar chunks antiguos ANTES de descargar
        cleanupOldChunks();
        
        // Generar nombre de archivo con timestamp formato YYYYMMDD_HHMMSS
        const now = new Date();
        const timestamp = now.getFullYear().toString() + 
                         (now.getMonth() + 1).toString().padStart(2, '0') +
                         now.getDate().toString().padStart(2, '0') + '_' +
                         now.getHours().toString().padStart(2, '0') +
                         now.getMinutes().toString().padStart(2, '0') +
                         now.getSeconds().toString().padStart(2, '0');
        
        const outputFile = path.join(LOG_DIR, `railway-logs-complete-${timestamp}.log`);
        
        console.log(`🚀 Ejecutando descarga completa de logs Railway...`);
        console.log(`⚠️  Esto puede tomar unos minutos...`);
        
        // Descargar logs usando Railway CLI
        let logs;
        
        try {
            console.log('🔗 Descargando logs del deployment vinculado...');
            
            // Estrategia: usar redirección a archivo para evitar timeout de buffer
            console.log('📊 Descargando directamente a archivo...');
            
            const tempCommand = process.platform === 'win32' 
                ? `railway logs --deployment > "${outputFile}"`
                : `railway logs --deployment > "${outputFile}"`;
            
            execSync(tempCommand, { 
                encoding: 'utf8',
                timeout: 600000, // 10 minutos
                shell: true
            });
            
            // Leer el archivo generado
            if (!fs.existsSync(outputFile)) {
                throw new Error('No se generó el archivo de logs');
            }
            
            logs = fs.readFileSync(outputFile, 'utf8');
            
            if (!logs || logs.trim().length === 0) {
                throw new Error('No se obtuvieron logs del deployment');
            }
            
        } catch (error) {
            if (error.message.includes('No linked project')) {
                console.error('\n❌ No hay proyecto vinculado.');
                console.error('🔧 Para vincular tu proyecto ejecuta:');
                console.error('   railway link');
                console.error('   (Selecciona el proyecto correcto)\n');
                throw new Error('Proyecto no vinculado. Ejecuta "railway link" primero.');
            }
            throw error;
        }
        
        // Crear header con información detallada  
        const header = `
=============================
📊 Railway Logs Completos - ${new Date().toLocaleString('es-CO')}
=============================
Proyecto: awake-enchantment (Data_Service_Bot)
URL: dataservicebot-production.up.railway.app
Descargado: ${timestamp}
Líneas totales: ${logs.split('\n').length}
Tamaño: ${Math.round(Buffer.byteLength(logs, 'utf8') / 1024)} KB
=============================

`;
        
        // Escribir archivo principal
        fs.writeFileSync(outputFile, header + logs);
        
        console.log(`✅ Logs descargados exitosamente:`);
        console.log(`📁 Archivo: ${path.basename(outputFile)}`);
        console.log(`📊 Líneas: ${logs.split('\n').length}`);
        console.log(`💾 Tamaño: ${Math.round(fs.statSync(outputFile).size / 1024)} KB`);
        
        // Analizar webhooks en los logs
        const webhookLines = logs.split('\n').filter(line => 
            line.includes('webhook') || 
            line.includes('beds24') || 
            line.includes('/api/webhooks/beds24') ||
            line.includes('Processing Beds24 webhook') ||
            line.includes('Beds24 webhook')
        );
        
        if (webhookLines.length > 0) {
            console.log(`🎯 Líneas relacionadas con webhooks: ${webhookLines.length}`);
            
            // Crear archivo separado solo con webhooks
            const webhookFile = path.join(LOG_DIR, `webhook-logs-${timestamp}.log`);
            const webhookHeader = `
=============================
🔗 Railway Webhook Logs - ${new Date().toLocaleString('es-CO')}
=============================
Filtrado desde: railway-logs-complete-${timestamp}.log
Líneas de webhook: ${webhookLines.length}
Términos: webhook, beds24, Processing Beds24 webhook
=============================

`;
            fs.writeFileSync(webhookFile, webhookHeader + webhookLines.join('\n'));
            console.log(`📝 Archivo de webhooks creado: ${path.basename(webhookFile)}`);
        }
        
        // Buscar errores
        const errorLines = logs.split('\n').filter(line => 
            line.toLowerCase().includes('error') || 
            line.toLowerCase().includes('failed') ||
            line.toLowerCase().includes('exception') ||
            line.includes('status=500') ||
            line.includes('Request failed with status code')
        );
        
        if (errorLines.length > 0) {
            console.log(`❌ Líneas con errores encontradas: ${errorLines.length}`);
            
            // Crear archivo separado solo con errores
            const errorFile = path.join(LOG_DIR, `error-logs-${timestamp}.log`);
            const errorHeader = `
=============================
❌ Railway Error Logs - ${new Date().toLocaleString('es-CO')}
=============================
Filtrado desde: railway-logs-complete-${timestamp}.log
Líneas de error: ${errorLines.length}
Términos: error, failed, exception, status=500
=============================

`;
            fs.writeFileSync(errorFile, errorHeader + errorLines.join('\n'));
            console.log(`🚨 Archivo de errores creado: ${path.basename(errorFile)}`);
        }
        
        return outputFile;
        
    } catch (error) {
        console.error('❌ Error descargando logs de Railway:', error.message);
        
        if (error.message.includes('railway: command not found')) {
            console.error('💡 Instala Railway CLI: npm install -g @railway/cli');
        } else if (error.message.includes('timeout')) {
            console.error('💡 Los logs son muy grandes. Intenta con un rango menor.');
        }
        
        throw error;
    }
}

// Función para filtrar logs por términos específicos
function filterLogs(terms = ['webhook', 'beds24']) {
    try {
        const files = fs.readdirSync(LOG_DIR)
            .filter(file => file.startsWith('railway-logs-complete-') && file.endsWith('.log'))
            .sort()
            .slice(-1); // Tomar el más reciente
        
        if (files.length === 0) {
            console.log('❌ No hay archivos de logs para filtrar. Ejecuta download primero.');
            return;
        }
        
        const latestFile = files[0];
        const logs = fs.readFileSync(path.join(LOG_DIR, latestFile), 'utf8');
        
        console.log(`🔍 Filtrando logs desde: ${latestFile}`);
        console.log(`🎯 Términos de búsqueda: ${terms.join(', ')}`);
        
        const filteredLines = logs.split('\n').filter(line => 
            terms.some(term => line.toLowerCase().includes(term.toLowerCase()))
        );
        
        if (filteredLines.length === 0) {
            console.log('❌ No se encontraron líneas con los términos especificados');
            return;
        }
        
        // Crear archivo filtrado
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filteredFile = path.join(LOG_DIR, `filtered-logs-${timestamp}.log`);
        const header = `
=============================
🔍 Logs Filtrados - ${new Date().toLocaleString('es-CO')}
=============================
Archivo origen: ${latestFile}
Términos: ${terms.join(', ')}
Líneas encontradas: ${filteredLines.length}
=============================

`;
        
        fs.writeFileSync(filteredFile, header + filteredLines.join('\n'));
        
        console.log(`✅ Filtrado completado:`);
        console.log(`📁 Archivo: ${filteredFile}`);
        console.log(`📊 Líneas filtradas: ${filteredLines.length}`);
        
        // Mostrar primeras líneas como preview
        console.log(`\n📝 Preview (primeras 5 líneas):`);
        filteredLines.slice(0, 5).forEach((line, i) => {
            console.log(`${i + 1}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
        });
        
    } catch (error) {
        console.error('Error filtrando logs:', error.message);
    }
}

// Función para mostrar estadísticas
function showStats() {
    try {
        const files = fs.readdirSync(LOG_DIR)
            .filter(file => file.endsWith('.log'))
            .map(file => {
                const filePath = path.join(LOG_DIR, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    size: Math.round(stats.size / 1024),
                    date: stats.mtime.toISOString().slice(0, 19).replace('T', ' ')
                };
            })
            .sort((a, b) => b.date > a.date ? 1 : -1);
        
        console.log('\n📊 Estadísticas de logs descargados:');
        console.log('====================================');
        
        files.forEach(file => {
            console.log(`📁 ${file.name}`);
            console.log(`   💾 ${file.size} KB | 📅 ${file.date}`);
        });
        
        console.log(`\n📈 Total archivos: ${files.length}`);
        console.log(`💾 Espacio usado: ${files.reduce((total, f) => total + f.size, 0)} KB`);
        
    } catch (error) {
        console.error('Error mostrando estadísticas:', error.message);
    }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'download';

switch (command) {
    case 'download':
        downloadAllRailwayLogs()
            .then(file => {
                console.log(`\n🎉 Descarga completada: ${path.basename(file)}`);
                console.log(`💡 Usa 'filter' para buscar términos específicos`);
            })
            .catch(error => {
                console.error('❌ Descarga falló:', error.message);
                process.exit(1);
            });
        break;
        
    case 'filter':
        const terms = args.slice(1);
        if (terms.length === 0) {
            filterLogs(); // Usar términos por defecto
        } else {
            filterLogs(terms);
        }
        break;
        
    case 'stats':
        showStats();
        break;
        
    case 'help':
        console.log(`
📊 Script de Descarga de Logs Railway

Uso:
  node scripts/download-railway-logs.js download         # Descargar todos los logs del deployment
  node scripts/download-railway-logs.js filter [terms]  # Filtrar logs por términos
  node scripts/download-railway-logs.js stats           # Ver estadísticas
  node scripts/download-railway-logs.js help            # Ver ayuda

Ejemplos:
  node scripts/download-railway-logs.js download                    # Descargar todos los logs
  node scripts/download-railway-logs.js filter webhook beds24       # Filtrar por webhook y beds24
  node scripts/download-railway-logs.js filter error failed         # Filtrar por errores
  node scripts/download-railway-logs.js stats                       # Ver archivos descargados

Archivos se guardan en: logs/railway/

Características:
- Descarga completa de logs del deployment
- Filtrado automático de webhooks y errores
- Archivos separados por categoría
- Limpieza automática de archivos antiguos
`);
        break;
        
    default:
        console.error(`❌ Comando desconocido: ${command}`);
        console.error('💡 Usa: node scripts/download-railway-logs.js help');
        process.exit(1);
}