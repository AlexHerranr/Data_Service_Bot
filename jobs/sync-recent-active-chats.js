/**
 * Script para sincronizar SOLO chats con actividad reciente
 * Usa /messages/list con filtro de tiempo para obtener contactos activos
 */

import { PrismaClient } from '@prisma/client';
import https from 'https';

const prisma = new PrismaClient();
const WHAPI_TOKEN = 'hXoVA1qcPcFPQ0uh8AZckGzbPxquj7dZ';

// Configuración de tiempo (últimos 30 días por defecto)
const DAYS_BACK = 30;

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

async function syncRecentActiveChats() {
    console.log('🔄 SINCRONIZANDO CHATS CON ACTIVIDAD RECIENTE');
    console.log('=' .repeat(60));
    
    try {
        // 1. Calcular timestamp desde hace X días
        const timeFrom = Math.floor((Date.now() - (DAYS_BACK * 24 * 60 * 60 * 1000)) / 1000);
        const timeTo = Math.floor(Date.now() / 1000);
        
        console.log(`📅 Período: Últimos ${DAYS_BACK} días`);
        console.log(`   Desde: ${new Date(timeFrom * 1000).toLocaleDateString()}`);
        console.log(`   Hasta: ${new Date(timeTo * 1000).toLocaleDateString()}`);
        
        // 2. Limpiar tabla actual
        console.log('\n🗑️ Limpiando ClientView actual...');
        await prisma.$executeRaw`DELETE FROM "ClientView"`;
        console.log('✅ Tabla limpiada');
        
        // 3. Obtener mensajes recientes
        console.log('\n📱 Obteniendo mensajes recientes...');
        let allMessages = [];
        let offset = 0;
        const limit = 100;
        
        while (true) {
            const url = `/messages/list?count=${limit}&offset=${offset}&time_from=${timeFrom}&time_to=${timeTo}&normal_types=true`;
            console.log(`  • Obteniendo batch ${Math.floor(offset/limit) + 1}...`);
            
            const response = await fetchWhapi(url);
            
            if (!response.messages || response.messages.length === 0) {
                console.log('  • No hay más mensajes');
                break;
            }
            
            allMessages = allMessages.concat(response.messages);
            console.log(`    - ${response.messages.length} mensajes (total: ${allMessages.length})`);
            
            if (response.messages.length < limit) break;
            offset += limit;
            
            // Limitar a 1000 mensajes para no sobrecargar
            if (allMessages.length >= 1000) {
                console.log('  • Límite de 1000 mensajes alcanzado');
                break;
            }
            
            await new Promise(r => setTimeout(r, 500));
        }
        
        console.log(`\n📊 Total de mensajes obtenidos: ${allMessages.length}`);
        
        // 4. Extraer chats únicos de los mensajes
        const uniqueChats = new Map();
        
        for (const msg of allMessages) {
            if (!msg.chat_id || msg.chat_id.includes('@broadcast')) continue;
            
            // Si ya tenemos este chat, actualizar si este mensaje es más reciente
            if (!uniqueChats.has(msg.chat_id) || msg.timestamp > uniqueChats.get(msg.chat_id).lastActivity) {
                uniqueChats.set(msg.chat_id, {
                    chatId: msg.chat_id,
                    name: msg.chat_name || msg.from_name || null,
                    lastActivity: msg.timestamp,
                    isGroup: msg.chat_id.includes('@g.us')
                });
            }
        }
        
        console.log(`\n✅ Chats únicos encontrados: ${uniqueChats.size}`);
        console.log(`  • Grupos: ${Array.from(uniqueChats.values()).filter(c => c.isGroup).length}`);
        console.log(`  • Contactos: ${Array.from(uniqueChats.values()).filter(c => !c.isGroup).length}`);
        
        // 5. Ahora obtener detalles de cada chat desde /chats
        console.log('\n📋 Obteniendo detalles de los chats activos...');
        const chatsResponse = await fetchWhapi('/chats?count=1000');
        const chatDetails = new Map();
        
        if (chatsResponse.chats) {
            for (const chat of chatsResponse.chats) {
                chatDetails.set(chat.id, {
                    name: chat.name,
                    labels: chat.labels
                });
            }
        }
        
        // 6. Insertar chats activos en ClientView
        console.log('\n💾 Insertando chats activos en ClientView...');
        let inserted = 0;
        let errors = 0;
        
        for (const [chatId, chatInfo] of uniqueChats) {
            try {
                // Extraer número de teléfono
                let phoneNumber = chatId.replace('@s.whatsapp.net', '').replace('@g.us', '');
                
                // Obtener detalles adicionales si existen
                const details = chatDetails.get(chatId) || {};
                
                // Extraer etiquetas si existen
                let labels = null;
                if (details.labels && Array.isArray(details.labels)) {
                    labels = details.labels.map(l => l.name).join(', ');
                }
                
                // Usar el mejor nombre disponible
                const name = details.name || chatInfo.name;
                
                // Convertir timestamp a fecha
                const lastActivity = new Date(chatInfo.lastActivity * 1000);
                
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
                        ${name},
                        ${name},
                        ${labels},
                        ${chatId},
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
                    process.stdout.write(`\r  Insertados: ${inserted}/${uniqueChats.size}`);
                }
                
            } catch (error) {
                errors++;
                console.error(`\n  ❌ Error con ${chatInfo.name || chatId}:`, error.message);
            }
        }
        
        console.log(`\n\n✅ Sincronización completada:`);
        console.log(`  • Insertados: ${inserted}`);
        console.log(`  • Errores: ${errors}`);
        
        // 7. Mostrar estadísticas finales
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN "chatId" LIKE '%@g.us' THEN 1 END) as grupos,
                COUNT(CASE WHEN "chatId" NOT LIKE '%@g.us' THEN 1 END) as contactos,
                COUNT("labels") as con_etiquetas,
                MIN("lastActivity") as primera_actividad,
                MAX("lastActivity") as ultima_actividad
            FROM "ClientView"
        `;
        
        console.log('\n📊 Estado final de ClientView:');
        console.table(stats);
        
        // 8. Mostrar distribución de actividad
        const distribution = await prisma.$queryRaw`
            SELECT 
                CASE 
                    WHEN "lastActivity" >= CURRENT_DATE - INTERVAL '7 days' THEN 'Última semana'
                    WHEN "lastActivity" >= CURRENT_DATE - INTERVAL '14 days' THEN 'Últimas 2 semanas'
                    WHEN "lastActivity" >= CURRENT_DATE - INTERVAL '30 days' THEN 'Último mes'
                    ELSE 'Más de 30 días'
                END as periodo,
                COUNT(*) as cantidad
            FROM "ClientView"
            GROUP BY periodo
            ORDER BY 
                CASE periodo
                    WHEN 'Última semana' THEN 1
                    WHEN 'Últimas 2 semanas' THEN 2
                    WHEN 'Último mes' THEN 3
                    ELSE 4
                END
        `;
        
        console.log('\n📈 Distribución de actividad:');
        console.table(distribution);
        
        // 9. Mostrar muestra de contactos más activos
        const topActive = await prisma.$queryRaw`
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
        
        console.log('\n🔥 Top 10 contactos más activos recientemente:');
        console.table(topActive);
        
        console.log('\n' + '=' .repeat(60));
        console.log(`✅ ClientView actualizada con chats activos de los últimos ${DAYS_BACK} días`);
        console.log('Solo se incluyeron contactos con mensajes intercambiados en ese período');
        
    } catch (error) {
        console.error('❌ Error general:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
syncRecentActiveChats();