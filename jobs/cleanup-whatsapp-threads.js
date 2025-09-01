/**
 * Job para limpiar threads de WhatsApp cuando alcanzan 1 millón de tokens
 * Se ejecuta diariamente a las 3:00 AM
 */

import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';

const prisma = new PrismaClient();

// Límite de tokens (1 millón)
const TOKEN_LIMIT = 1000000;

/**
 * Función principal de limpieza
 */
async function cleanupWhatsAppThreads() {
    console.log('🧹 INICIANDO LIMPIEZA DE THREADS DE WHATSAPP');
    console.log(`📅 Fecha/Hora: ${new Date().toISOString()}`);
    console.log('=' .repeat(60));
    
    try {
        // 1. Buscar threads que exceden el límite
        console.log(`\n🔍 Buscando threads con más de ${TOKEN_LIMIT.toLocaleString()} tokens...`);
        
        const threadsToClean = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "userName",
                "threadId",
                "threadTokenCount"
            FROM "ClientView"
            WHERE "threadTokenCount" >= ${TOKEN_LIMIT}
            AND "threadId" IS NOT NULL
        `;
        
        if (threadsToClean.length === 0) {
            console.log('✅ No hay threads que requieran limpieza');
            return {
                success: true,
                cleaned: 0,
                message: 'No threads exceeded token limit'
            };
        }
        
        console.log(`⚠️ Encontrados ${threadsToClean.length} threads para limpiar:`);
        threadsToClean.forEach(thread => {
            console.log(`  • ${thread.name || thread.userName || thread.phoneNumber}: ${thread.threadTokenCount.toLocaleString()} tokens`);
        });
        
        // 2. Limpiar los threads
        console.log('\n🗑️ Limpiando threads...');
        let cleanedCount = 0;
        let errors = [];
        
        for (const thread of threadsToClean) {
            try {
                // Actualizar el registro
                await prisma.$executeRaw`
                    UPDATE "ClientView"
                    SET 
                        "threadId" = NULL,
                        "threadTokenCount" = 0
                    WHERE "phoneNumber" = ${thread.phoneNumber}
                `;
                
                cleanedCount++;
                console.log(`  ✅ Limpiado: ${thread.phoneNumber} (${thread.name || thread.userName})`);
                
                // Log en una tabla de auditoría (si existe)
                try {
                    await logCleanup(thread);
                } catch (logError) {
                    console.log(`  ⚠️ No se pudo registrar en auditoría: ${logError.message}`);
                }
                
            } catch (error) {
                console.error(`  ❌ Error limpiando ${thread.phoneNumber}: ${error.message}`);
                errors.push({
                    phoneNumber: thread.phoneNumber,
                    error: error.message
                });
            }
        }
        
        // 3. Resumen
        console.log('\n' + '=' .repeat(60));
        console.log('📊 RESUMEN DE LIMPIEZA:');
        console.log(`  • Threads procesados: ${threadsToClean.length}`);
        console.log(`  • Threads limpiados: ${cleanedCount}`);
        console.log(`  • Errores: ${errors.length}`);
        
        if (errors.length > 0) {
            console.log('\n❌ Errores encontrados:');
            errors.forEach(e => {
                console.log(`  • ${e.phoneNumber}: ${e.error}`);
            });
        }
        
        return {
            success: true,
            processed: threadsToClean.length,
            cleaned: cleanedCount,
            errors: errors
        };
        
    } catch (error) {
        console.error('❌ ERROR GENERAL:', error.message);
        return {
            success: false,
            error: error.message
        };
    } finally {
        await prisma.$disconnect();
    }
}

/**
 * Registra la limpieza en una tabla de auditoría
 */
async function logCleanup(thread) {
    // Intentar crear tabla de auditoría si no existe
    try {
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "WhatsAppCleanupLog" (
                id SERIAL PRIMARY KEY,
                "phoneNumber" TEXT NOT NULL,
                "threadId" TEXT,
                "tokenCount" INTEGER,
                "cleanedAt" TIMESTAMP DEFAULT NOW(),
                "contactName" TEXT
            )
        `;
        
        // Insertar registro de limpieza
        await prisma.$executeRaw`
            INSERT INTO "WhatsAppCleanupLog" 
            ("phoneNumber", "threadId", "tokenCount", "contactName")
            VALUES (
                ${thread.phoneNumber},
                ${thread.threadId},
                ${thread.threadTokenCount},
                ${thread.name || thread.userName}
            )
        `;
    } catch (error) {
        // Si falla, no es crítico
        console.log(`  ℹ️ No se pudo registrar en log: ${error.message}`);
    }
}

/**
 * Función para ejecutar manualmente
 */
export async function runManualCleanup() {
    console.log('🚀 Ejecutando limpieza manual...\n');
    const result = await cleanupWhatsAppThreads();
    console.log('\n✅ Limpieza manual completada');
    return result;
}

/**
 * Configurar el cron job
 * Formato: '0 3 * * *' = Todos los días a las 3:00 AM
 */
export function setupCronJob() {
    // Programar para las 3:00 AM todos los días
    const schedule = '0 3 * * *';
    
    console.log('⏰ Configurando job de limpieza de WhatsApp threads');
    console.log(`📅 Programado para: ${schedule} (3:00 AM diariamente)`);
    
    const job = cron.schedule(schedule, async () => {
        console.log('\n' + '='.repeat(60));
        console.log('⏰ CRON JOB ACTIVADO');
        await cleanupWhatsAppThreads();
        console.log('⏰ CRON JOB COMPLETADO');
        console.log('='.repeat(60) + '\n');
    }, {
        scheduled: true,
        timezone: "America/Bogota" // Ajustar según tu zona horaria
    });
    
    console.log('✅ Job configurado exitosamente');
    return job;
}

/**
 * Verificar estado actual (útil para debugging)
 */
export async function checkCurrentStatus() {
    console.log('📊 ESTADO ACTUAL DE THREADS');
    console.log('=' .repeat(60));
    
    try {
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total_contacts,
                COUNT(CASE WHEN "threadTokenCount" > 0 THEN 1 END) as with_tokens,
                COUNT(CASE WHEN "threadTokenCount" >= ${TOKEN_LIMIT} THEN 1 END) as exceeding_limit,
                MAX("threadTokenCount") as max_tokens,
                AVG("threadTokenCount")::INTEGER as avg_tokens
            FROM "ClientView"
            WHERE "threadId" IS NOT NULL
        `;
        
        console.table(stats);
        
        // Mostrar los que están cerca del límite
        const nearLimit = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "userName",
                "threadTokenCount",
                ROUND(("threadTokenCount"::DECIMAL / ${TOKEN_LIMIT}) * 100, 2) as percentage
            FROM "ClientView"
            WHERE "threadTokenCount" > ${TOKEN_LIMIT * 0.8} -- 80% del límite
            ORDER BY "threadTokenCount" DESC
        `;
        
        if (nearLimit.length > 0) {
            console.log(`\n⚠️ Threads cerca del límite (>80%):`);
            console.table(nearLimit);
        } else {
            console.log('\n✅ Ningún thread cerca del límite');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

// Si se ejecuta directamente (no como módulo)
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    
    if (args.includes('--check')) {
        // Verificar estado actual
        checkCurrentStatus().then(() => process.exit(0));
    } else if (args.includes('--run')) {
        // Ejecutar limpieza manual
        runManualCleanup().then(() => process.exit(0));
    } else if (args.includes('--cron')) {
        // Iniciar el cron job
        setupCronJob();
        console.log('🔄 Cron job ejecutándose... (Ctrl+C para detener)');
    } else {
        // Mostrar ayuda
        console.log('📚 USO:');
        console.log('  node cleanup-whatsapp-threads.js --check   # Ver estado actual');
        console.log('  node cleanup-whatsapp-threads.js --run     # Ejecutar limpieza ahora');
        console.log('  node cleanup-whatsapp-threads.js --cron    # Iniciar cron job');
        process.exit(0);
    }
}