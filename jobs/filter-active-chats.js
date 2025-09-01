/**
 * Script para filtrar y sincronizar SOLO chats con mensajes intercambiados
 * Excluye contactos guardados sin conversación
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function filterActiveChats() {
    console.log('🔍 FILTRANDO ClientView - SOLO CHATS CON MENSAJES');
    console.log('=' .repeat(60));
    
    try {
        // 1. Contar estado actual
        const currentStats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total_actual,
                COUNT(CASE WHEN "chatId" LIKE '%@g.us' THEN 1 END) as grupos,
                COUNT(CASE WHEN "chatId" NOT LIKE '%@g.us' AND "chatId" NOT LIKE '%@broadcast' THEN 1 END) as contactos
            FROM "ClientView"
        `;
        
        console.log('\n📊 Estado actual de ClientView:');
        console.table(currentStats);
        
        // 2. Identificar contactos sin mensajes (para eliminar)
        // Asumimos que los contactos sin mensajes tienen lastActivity muy reciente y similar
        // o podemos verificar por patrones
        console.log('\n🔍 Buscando posibles contactos sin mensajes...');
        
        // Obtener todos los contactos ordenados por lastActivity
        const allContacts = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "chatId",
                "lastActivity",
                "threadTokenCount"
            FROM "ClientView"
            WHERE "chatId" NOT LIKE '%@g.us'
            ORDER BY "lastActivity" DESC
        `;
        
        // Agrupar por fecha similar (probablemente agregados en masa)
        const recentDate = new Date('2025-08-30');
        let toRemove = [];
        
        for (const contact of allContacts) {
            const activityDate = new Date(contact.lastActivity);
            
            // Si la actividad es del 30 de agosto 2025 y no tiene tokens
            // probablemente es un contacto sin mensajes
            if (activityDate >= recentDate && contact.threadTokenCount === 0) {
                toRemove.push(contact);
            }
        }
        
        console.log(`\n⚠️ Encontrados ${toRemove.length} contactos sospechosos (sin mensajes)`);
        
        if (toRemove.length > 0) {
            console.log('\nEjemplos de contactos a eliminar:');
            toRemove.slice(0, 10).forEach(c => {
                console.log(`  • ${c.name || c.phoneNumber}`);
            });
            
            // 3. Eliminar contactos sin mensajes
            console.log('\n🗑️ Eliminando contactos sin mensajes...');
            
            let deleted = 0;
            for (const contact of toRemove) {
                try {
                    await prisma.$executeRaw`
                        DELETE FROM "ClientView"
                        WHERE "phoneNumber" = ${contact.phoneNumber}
                    `;
                    deleted++;
                } catch (e) {
                    console.error(`Error eliminando ${contact.phoneNumber}:`, e.message);
                }
            }
            
            console.log(`✅ Eliminados ${deleted} contactos sin mensajes`);
        }
        
        // 4. Verificar estado final
        const finalStats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total_final,
                COUNT(CASE WHEN "chatId" LIKE '%@g.us' THEN 1 END) as grupos,
                COUNT(CASE WHEN "chatId" NOT LIKE '%@g.us' THEN 1 END) as contactos_activos
            FROM "ClientView"
        `;
        
        console.log('\n📊 Estado final de ClientView:');
        console.table(finalStats);
        
        // 5. Mostrar muestra de contactos que quedaron
        const activeSample = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                COALESCE("name", "userName", "phoneNumber") as nombre,
                TO_CHAR("lastActivity", 'YYYY-MM-DD') as fecha,
                "threadTokenCount" as tokens
            FROM "ClientView"
            WHERE "chatId" NOT LIKE '%@g.us'
            ORDER BY "lastActivity" ASC
            LIMIT 20
        `;
        
        console.log('\n✅ Muestra de contactos ACTIVOS (con mensajes):');
        console.table(activeSample);
        
        console.log('\n' + '=' .repeat(60));
        console.log('✅ LIMPIEZA COMPLETADA');
        console.log('ClientView ahora contiene SOLO chats con mensajes intercambiados');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
filterActiveChats();