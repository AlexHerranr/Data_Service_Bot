/**
 * Script simple para limpiar threads de WhatsApp que exceden 1 millón de tokens
 * Puede ejecutarse manualmente o mediante cron del sistema
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TOKEN_LIMIT = 1000000; // 1 millón de tokens

async function cleanupThreads() {
    const startTime = new Date();
    console.log('🧹 LIMPIEZA DE THREADS DE WHATSAPP');
    console.log(`📅 ${startTime.toLocaleString()}`);
    console.log('=' .repeat(60));
    
    try {
        // 1. Verificar estado actual
        const beforeStats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN "threadTokenCount" >= ${TOKEN_LIMIT} THEN 1 END) as to_clean,
                MAX("threadTokenCount") as max_tokens
            FROM "ClientView"
        `;
        
        console.log('\n📊 Estado antes de limpieza:');
        console.log(`  • Total contactos: ${beforeStats[0].total}`);
        console.log(`  • Para limpiar (>1M tokens): ${beforeStats[0].to_clean}`);
        console.log(`  • Máximo tokens actual: ${beforeStats[0].max_tokens?.toLocaleString() || 0}`);
        
        if (beforeStats[0].to_clean === 0n) {
            console.log('\n✅ No hay threads que limpiar');
            return;
        }
        
        // 2. Obtener threads a limpiar
        const threadsToClean = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                COALESCE("name", "userName", "phoneNumber") as contact_name,
                "threadId",
                "threadTokenCount"
            FROM "ClientView"
            WHERE "threadTokenCount" >= ${TOKEN_LIMIT}
            AND "threadId" IS NOT NULL
        `;
        
        console.log(`\n🎯 Limpiando ${threadsToClean.length} threads:`);
        
        // 3. Limpiar cada thread
        let cleaned = 0;
        for (const thread of threadsToClean) {
            try {
                await prisma.$executeRaw`
                    UPDATE "ClientView"
                    SET 
                        "threadId" = NULL,
                        "threadTokenCount" = 0
                    WHERE "phoneNumber" = ${thread.phoneNumber}
                `;
                
                cleaned++;
                console.log(`  ✅ ${thread.contact_name}: ${thread.threadTokenCount.toLocaleString()} tokens → 0`);
                
            } catch (error) {
                console.error(`  ❌ Error con ${thread.contact_name}: ${error.message}`);
            }
        }
        
        // 4. Crear registro de auditoría
        try {
            // Crear tabla si no existe
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "ThreadCleanupLog" (
                    id SERIAL PRIMARY KEY,
                    cleaned_count INTEGER,
                    total_tokens_cleared BIGINT,
                    execution_time TIMESTAMP DEFAULT NOW(),
                    details JSONB
                )
            `);
            
            // Calcular total de tokens limpiados
            const totalTokens = threadsToClean.reduce((sum, t) => sum + Number(t.threadTokenCount), 0);
            
            // Insertar registro
            await prisma.$executeRawUnsafe(`
                INSERT INTO "ThreadCleanupLog" (cleaned_count, total_tokens_cleared, details)
                VALUES ($1, $2, $3)
            `, cleaned, totalTokens, JSON.stringify({
                threads: threadsToClean.map(t => ({
                    phone: t.phoneNumber,
                    name: t.contact_name,
                    tokens: Number(t.threadTokenCount)
                }))
            }));
            
            console.log('\n📝 Registro de auditoría creado');
        } catch (e) {
            console.log('\n⚠️ No se pudo crear registro de auditoría');
        }
        
        // 5. Resumen final
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000;
        
        console.log('\n' + '=' .repeat(60));
        console.log('✅ LIMPIEZA COMPLETADA');
        console.log(`  • Threads procesados: ${threadsToClean.length}`);
        console.log(`  • Threads limpiados: ${cleaned}`);
        console.log(`  • Tiempo de ejecución: ${duration.toFixed(2)} segundos`);
        console.log('=' .repeat(60));
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

// Función para verificar estado sin limpiar
async function checkStatus() {
    console.log('📊 ESTADO DE THREADS DE WHATSAPP');
    console.log('=' .repeat(60));
    
    try {
        // Estadísticas generales
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total_contacts,
                COUNT(CASE WHEN "threadTokenCount" > 0 THEN 1 END) as with_tokens,
                COUNT(CASE WHEN "threadTokenCount" >= ${TOKEN_LIMIT * 0.5} THEN 1 END) as above_50_percent,
                COUNT(CASE WHEN "threadTokenCount" >= ${TOKEN_LIMIT * 0.8} THEN 1 END) as above_80_percent,
                COUNT(CASE WHEN "threadTokenCount" >= ${TOKEN_LIMIT} THEN 1 END) as above_limit,
                MAX("threadTokenCount") as max_tokens,
                AVG(CASE WHEN "threadTokenCount" > 0 THEN "threadTokenCount" END)::INTEGER as avg_tokens
            FROM "ClientView"
        `;
        
        console.log('\n📈 Estadísticas generales:');
        const s = stats[0];
        console.log(`  • Total contactos: ${s.total_contacts}`);
        console.log(`  • Con tokens activos: ${s.with_tokens}`);
        console.log(`  • Sobre 50% del límite (500K): ${s.above_50_percent}`);
        console.log(`  • Sobre 80% del límite (800K): ${s.above_80_percent}`);
        console.log(`  • SOBRE EL LÍMITE (1M): ${s.above_limit}`);
        console.log(`  • Máximo actual: ${s.max_tokens?.toLocaleString() || 0} tokens`);
        console.log(`  • Promedio (activos): ${s.avg_tokens?.toLocaleString() || 0} tokens`);
        
        // Mostrar los más altos
        const topThreads = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                COALESCE("name", "userName", "phoneNumber") as contact_name,
                "threadTokenCount",
                ROUND(("threadTokenCount"::DECIMAL / ${TOKEN_LIMIT}) * 100, 1) as percentage,
                "threadId"
            FROM "ClientView"
            WHERE "threadTokenCount" > 0
            ORDER BY "threadTokenCount" DESC
            LIMIT 10
        `;
        
        if (topThreads.length > 0) {
            console.log('\n🔝 Top 10 threads con más tokens:');
            console.table(topThreads.map(t => ({
                Contacto: t.contact_name,
                Tokens: t.threadTokenCount.toLocaleString(),
                Porcentaje: `${t.percentage}%`,
                Estado: t.threadTokenCount >= TOKEN_LIMIT ? '⚠️ LIMPIAR' : '✅ OK'
            })));
        }
        
        // Verificar últimas limpiezas
        try {
            const lastCleanups = await prisma.$queryRaw`
                SELECT 
                    execution_time,
                    cleaned_count,
                    total_tokens_cleared
                FROM "ThreadCleanupLog"
                ORDER BY execution_time DESC
                LIMIT 5
            `;
            
            if (lastCleanups.length > 0) {
                console.log('\n🕐 Últimas limpiezas:');
                console.table(lastCleanups.map(l => ({
                    Fecha: new Date(l.execution_time).toLocaleString(),
                    'Threads limpiados': l.cleaned_count,
                    'Tokens liberados': l.total_tokens_cleared?.toLocaleString()
                })));
            }
        } catch (e) {
            // La tabla puede no existir aún
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar según argumentos
const args = process.argv.slice(2);

if (args.includes('--check') || args.includes('-c')) {
    checkStatus();
} else if (args.includes('--help') || args.includes('-h')) {
    console.log('📚 USO:');
    console.log('  node cleanup-threads-simple.js         # Ejecutar limpieza');
    console.log('  node cleanup-threads-simple.js --check # Ver estado actual');
    console.log('  node cleanup-threads-simple.js --help  # Ver esta ayuda');
    console.log('\n💡 Para programar ejecución automática, usar crontab:');
    console.log('  0 3 * * * cd /workspace/jobs && node cleanup-threads-simple.js');
} else {
    // Por defecto, ejecutar limpieza
    cleanupThreads();
}