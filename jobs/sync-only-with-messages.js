/**
 * Script para sincronizar SOLO chats que tienen mensajes intercambiados
 * Filtra por la presencia de last_message en la respuesta de /chats
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

async function syncOnlyWithMessages() {
    console.log('🔄 SINCRONIZANDO SOLO CHATS CON MENSAJES');
    console.log('=' .repeat(60));
    
    try {
        // 1. Limpiar tabla actual
        console.log('🗑️ Limpiando ClientView actual...');
        await prisma.$executeRaw`DELETE FROM "ClientView"`;
        console.log('✅ Tabla limpiada');
        
        // 2. Obtener chats de Whapi
        console.log('\n📱 Obteniendo chats de WhatsApp...');
        let allChats = [];
        let offset = 0;
        const limit = 100;
        
        while (true) {
            const response = await fetchWhapi(`/chats?count=${limit}&offset=${offset}`);
            
            if (!response.chats || response.chats.length === 0) break;
            
            allChats = allChats.concat(response.chats);
            console.log(`  • Obtenidos ${response.chats.length} chats (total: ${allChats.length})`);
            
            if (response.chats.length < limit) break;
            offset += limit;
            
            await new Promise(r => setTimeout(r, 500));
        }
        
        console.log(`\n📊 Total de chats obtenidos: ${allChats.length}`);
        
        // 3. FILTRAR SOLO LOS QUE TIENEN last_message
        const chatsWithMessages = allChats.filter(chat => {
            // Debe tener last_message para considerarse activo
            return chat.last_message && chat.id && !chat.id.includes('@broadcast');
        });
        
        console.log(`\n✅ Chats CON mensajes: ${chatsWithMessages.length}`);
        console.log(`❌ Chats SIN mensajes (ignorados): ${allChats.length - chatsWithMessages.length}`);
        
        // 4. Insertar solo chats con mensajes
        console.log('\n💾 Insertando chats activos en ClientView...');
        let inserted = 0;
        let errors = 0;
        
        for (const chat of chatsWithMessages) {
            try {
                // Extraer número de teléfono
                let phoneNumber = chat.id.replace('@s.whatsapp.net', '').replace('@g.us', '');
                
                // Extraer etiquetas si existen
                let labels = null;
                if (chat.labels && Array.isArray(chat.labels)) {
                    labels = chat.labels.map(l => l.name).join(', ');
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
                        "labels" = EXCLUDED."labels",
                        "chatId" = EXCLUDED."chatId",
                        "lastActivity" = EXCLUDED."lastActivity"
                `;
                
                inserted++;
                
                // Mostrar progreso
                if (inserted % 10 === 0) {
                    process.stdout.write(`\r  Insertados: ${inserted}/${chatsWithMessages.length}`);
                }
                
            } catch (error) {
                errors++;
                console.error(`\n  ❌ Error con ${chat.name || chat.id}:`, error.message);
            }
        }
        
        console.log(`\n\n✅ Sincronización completada:`);
        console.log(`  • Insertados: ${inserted}`);
        console.log(`  • Errores: ${errors}`);
        
        // 5. Mostrar estadísticas finales
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN "chatId" LIKE '%@g.us' THEN 1 END) as grupos,
                COUNT(CASE WHEN "chatId" NOT LIKE '%@g.us' THEN 1 END) as contactos,
                COUNT("labels") as con_etiquetas
            FROM "ClientView"
        `;
        
        console.log('\n📊 Estado final de ClientView:');
        console.table(stats);
        
        // 6. Mostrar muestra de contactos
        const sample = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                COALESCE("name", "userName", "phoneNumber") as nombre,
                "labels" as etiquetas,
                TO_CHAR("lastActivity", 'YYYY-MM-DD HH24:MI') as ultimo_mensaje
            FROM "ClientView"
            WHERE "chatId" NOT LIKE '%@g.us'
            ORDER BY "lastActivity" DESC
            LIMIT 10
        `;
        
        console.log('\n📋 Últimos 10 contactos con mensajes:');
        console.table(sample);
        
        console.log('\n' + '=' .repeat(60));
        console.log('✅ ClientView actualizada con SOLO chats activos (con mensajes)');
        
    } catch (error) {
        console.error('❌ Error general:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
syncOnlyWithMessages();