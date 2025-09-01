#!/usr/bin/env node

/**
 * Script de Migración Directa - Optimización Tabla Leads
 * Ejecutar con: node run-migration.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 INICIANDO MIGRACIÓN DE TABLA LEADS');
console.log('======================================\n');

// Verificar DATABASE_URL
if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL no está configurada');
    console.error('\nConfigura la variable DATABASE_URL:');
    console.error('export DATABASE_URL="postgresql://usuario:password@host:puerto/database"\n');
    process.exit(1);
}

console.log('✅ DATABASE_URL configurada\n');

// Función para ejecutar comandos
function runCommand(command, description) {
    console.log(`🔄 ${description}...`);
    try {
        const result = execSync(command, { 
            encoding: 'utf8',
            stdio: 'pipe'
        });
        console.log(`✅ ${description} - Completado\n`);
        return result;
    } catch (error) {
        console.error(`❌ Error en ${description}:`, error.message);
        throw error;
    }
}

async function runMigration() {
    try {
        // 1. Cambiar al directorio correcto
        process.chdir(path.join(__dirname, '..'));
        
        // 2. Generar cliente Prisma
        console.log('📦 Paso 1: Generando cliente Prisma...');
        runCommand('npx prisma generate', 'Generación de Prisma Client');
        
        // 3. Cambiar al directorio de migración
        process.chdir(__dirname);
        
        // 4. Ejecutar migración TypeScript
        console.log('🔨 Paso 2: Ejecutando migración...');
        console.log('Esto puede tomar 1-2 minutos...\n');
        
        // Importar y ejecutar el script de migración
        const migrationScript = require('./optimize-leads-minimal.ts');
        
        console.log('\n✅ Migración completada exitosamente');
        
    } catch (error) {
        console.error('\n❌ Error durante la migración:', error);
        console.error('\nIntenta ejecutar manualmente:');
        console.error('1. export DATABASE_URL="tu_connection_string"');
        console.error('2. cd /workspace/migration-scripts');
        console.error('3. npx tsx optimize-leads-minimal.ts\n');
        process.exit(1);
    }
}

// Confirmar antes de ejecutar
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('⚠️  IMPORTANTE:');
console.log('Esta migración va a:');
console.log('  1. Hacer backup de la tabla Leads actual');
console.log('  2. Crear nueva estructura optimizada (solo 10 campos)');
console.log('  3. Migrar todos los datos existentes');
console.log('  4. Actualizar triggers de sincronización');
console.log('  5. Re-sincronizar con reservas "Futura Pendiente"\n');

rl.question('¿Deseas continuar? (s/n): ', (answer) => {
    if (answer.toLowerCase() === 's') {
        rl.close();
        runMigration();
    } else {
        console.log('Migración cancelada');
        rl.close();
        process.exit(0);
    }
});