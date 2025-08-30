/**
 * Script DEFINITIVO para sincronizar chats de WhatsApp
 * Usa /chats pero SOLO incluye los que tienen last_message (mensajes intercambiados)
 * Captura TODA la información: nombres, etiquetas, etc.
 */

import { PrismaClient } from '@prisma/client';
import https from 'https';

const prisma = new PrismaClient();
const WHAPI_TOKEN = 'hXoVA1qcPcFPQ0uh8AZckGzbPxquj7dZ';

function fetchWhapi(path) {
    return new Promise((resolve, reject) => {
        https.request({
            hostname: 'gate.whapi.cloud',
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${WHAPI_TOKEN}`
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject).end();
    });
}

async function syncWhatsAppFinal() {
    console.log('🚀 SINCRONIZACIÓN DEFINITIVA DE WHATSAPP');
    console.log('=' .repeat(60));
    console.log('Estrategia: /chats con filtro por last_message');
    console.log('Solo incluye contactos con mensajes intercambiados');
    console.log('=' .repeat(60));
    
    try {
        // 1. Limpiar tabla actual
        console.log('\n🗑️ Limpiando ClientView actual...');
        await prisma.$executeRaw`DELETE FROM "ClientView"`;
        console.log('✅ Tabla limpiada');
        
        // 2. Obtener TODOS los chats (para tener histórico completo)
        console.log('\n📱 Obteniendo todos los chats de WhatsApp...');
        let allChats = [];
        let offset = 0;
        const limit = 100;
        let totalChats = 0;
        
        while (true) {
            const response = await fetchWhapi(`/chats?count=${limit}&offset=${offset}`);
            
            if (!response.chats || response.chats.length === 0) break;
            
            allChats = allChats.concat(response.chats);
            totalChats = response.total || allChats.length;
            
            console.log(`  • Batch ${Math.floor(offset/limit) + 1}: ${response.chats.length} chats (${allChats.length}/${totalChats})`);
            
            if (response.chats.length < limit) break;
            offset += limit;
            
            await new Promise(r => setTimeout(r, 300));
        }
        
        console.log(`\n📊 Total de chats obtenidos: ${allChats.length}`);
        
        // 3. FILTRAR: Solo los que tienen last_message (han intercambiado mensajes)
        const chatsWithMessages = allChats.filter(chat => {
            return chat.last_message && 
                   chat.id && 
                   !chat.id.includes('@broadcast') &&
                   !chat.id.includes('status@broadcast');
        });
        
        const chatsWithoutMessages = allChats.filter(chat => {
            return !chat.last_message && 
                   chat.id && 
                   !chat.id.includes('@broadcast');
        });
        
        console.log(`\n📊 Análisis de chats:`);
        console.log(`  ✅ CON mensajes: ${chatsWithMessages.length}`);
        console.log(`  ❌ SIN mensajes (ignorados): ${chatsWithoutMessages.length}`);
        console.log(`  📢 Broadcasts (ignorados): ${allChats.filter(c => c.id && c.id.includes('@broadcast')).length}`);
        
        // Mostrar algunos ejemplos de los que NO se incluirán
        if (chatsWithoutMessages.length > 0) {
            console.log('\n❌ Ejemplos de contactos SIN mensajes (no incluidos):');
            chatsWithoutMessages.slice(0, 5).forEach(chat => {
                console.log(`  • ${chat.name || chat.id}`);
            });
            if (chatsWithoutMessages.length > 5) {
                console.log(`  • ... y ${chatsWithoutMessages.length - 5} más`);
            }
        }
        
        // 4. Insertar SOLO chats con mensajes
        console.log('\n💾 Insertando chats CON mensajes en ClientView...');
        let inserted = 0;
        let errors = 0;
        let groups = 0;
        let withLabels = 0;
        
        for (const chat of chatsWithMessages) {
            try {
                // Extraer número de teléfono
                let phoneNumber = chat.id.replace('@s.whatsapp.net', '').replace('@g.us', '');
                
                // Verificar si es grupo
                const isGroup = chat.id.includes('@g.us');
                if (isGroup) groups++;
                
                // Extraer etiquetas si existen
                let labels = null;
                if (chat.labels && Array.isArray(chat.labels) && chat.labels.length > 0) {
                    labels = chat.labels.map(l => l.name).join(', ');
                    withLabels++;
                }
                
                // Obtener timestamp de último mensaje
                const lastActivity = chat.last_message.timestamp 
                    ? new Date(chat.last_message.timestamp * 1000)
                    : new Date();
                
                // Insertar en ClientView
                await prisma.$executeRaw`
                    INSERT INTO "ClientView" (
                        "phoneNumber",
                        "name",
                        "userName",
                        "labels",
                        "chatId",
                        "lastActivity",
                        "threadId",
                        "threadTokenCount"
                    ) VALUES (
                        ${phoneNumber},
                        ${chat.name || null},
                        ${chat.name || null},
                        ${labels},
                        ${chat.id},
                        ${lastActivity},
                        NULL,
                        0
                    )
                    ON CONFLICT ("phoneNumber") DO UPDATE SET
                        "name" = EXCLUDED."name",
                        "userName" = EXCLUDED."userName",
                        "labels" = EXCLUDED."labels",
                        "chatId" = EXCLUDED."chatId",
                        "lastActivity" = EXCLUDED."lastActivity"
                `;
                
                inserted++;
                
                // Mostrar progreso cada 50
                if (inserted % 50 === 0) {
                    process.stdout.write(`\r  Procesados: ${inserted}/${chatsWithMessages.length}`);
                }
                
            } catch (error) {
                errors++;
                if (errors <= 3) {
                    console.error(`\n  ❌ Error con ${chat.name || chat.id}:`, error.message);
                }
            }
        }
        
        console.log(`\n\n✅ Sincronización completada:`);
        console.log(`  • Insertados: ${inserted}`);
        console.log(`  • Grupos: ${groups}`);
        console.log(`  • Con etiquetas: ${withLabels}`);
        console.log(`  • Errores: ${errors}`);
        
        // 5. Estadísticas finales
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN "chatId" LIKE '%@g.us' THEN 1 END) as grupos,
                COUNT(CASE WHEN "chatId" NOT LIKE '%@g.us' THEN 1 END) as contactos,
                COUNT("labels") as con_etiquetas,
                COUNT("name") as con_nombre
            FROM "ClientView"
        `;
        
        console.log('\n📊 Estado final de ClientView:');
        console.table(stats);
        
        // 6. Distribución temporal
        const timeDistribution = await prisma.$queryRaw`
            SELECT 
                COUNT(CASE WHEN "lastActivity" >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as ultima_semana,
                COUNT(CASE WHEN "lastActivity" >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as ultimo_mes,
                COUNT(CASE WHEN "lastActivity" >= CURRENT_DATE - INTERVAL '90 days' THEN 1 END) as ultimos_3_meses,
                COUNT(*) as total_historico
            FROM "ClientView"
        `;
        
        console.log('\n📈 Distribución temporal de actividad:');
        console.table(timeDistribution);
        
        // 7. Top 10 más recientes
        const topRecent = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                COALESCE("name", "userName", "phoneNumber") as nombre,
                "labels" as etiquetas,
                TO_CHAR("lastActivity", 'DD/MM/YYYY HH24:MI') as ultimo_mensaje,
                CASE 
                    WHEN "chatId" LIKE '%@g.us' THEN 'Grupo'
                    ELSE 'Contacto'
                END as tipo
            FROM "ClientView"
            ORDER BY "lastActivity" DESC
            LIMIT 10
        `;
        
        console.log('\n🔥 Últimos 10 chats activos:');
        console.table(topRecent);
        
        // 8. Contactos con etiquetas
        if (withLabels > 0) {
            const labeledContacts = await prisma.$queryRaw`
                SELECT 
                    COALESCE("name", "phoneNumber") as contacto,
                    "labels" as etiquetas
                FROM "ClientView"
                WHERE "labels" IS NOT NULL
                ORDER BY "lastActivity" DESC
                LIMIT 10
            `;
            
            console.log('\n🏷️ Contactos con etiquetas:');
            console.table(labeledContacts);
        }
        
        // 9. Resumen final
        console.log('\n' + '=' .repeat(60));
        console.log('✅ SINCRONIZACIÓN COMPLETA Y OPTIMIZADA');
        console.log('\n📌 Resumen:');
        console.log(`  • De ${allChats.length} chats totales en WhatsApp`);
        console.log(`  • Se incluyeron ${inserted} que tienen mensajes intercambiados`);
        console.log(`  • Se ignoraron ${chatsWithoutMessages.length} contactos sin conversación`);
        console.log('\n💡 ClientView ahora contiene SOLO contactos activos con:');
        console.log('  • Nombres completos ✓');
        console.log('  • Etiquetas de WhatsApp ✓');
        console.log('  • Fecha de último mensaje ✓');
        console.log('  • Histórico completo (no solo últimos 30 días) ✓');
        
    } catch (error) {
        console.error('❌ Error general:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
syncWhatsAppFinal();