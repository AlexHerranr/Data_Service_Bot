/**
 * Script para obtener TODOS los chats con mensajes
 * Sin límites, con paginación completa hasta obtener todos
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

async function syncAllChatsComplete() {
    console.log('🚀 SINCRONIZACIÓN COMPLETA DE TODOS LOS CHATS');
    console.log('=' .repeat(60));
    console.log('Obteniendo TODOS los chats sin límites...');
    console.log('Usando batches de 500 (máximo permitido por la API)');
    console.log('=' .repeat(60));
    
    try {
        // 1. Limpiar tabla
        console.log('\n🗑️ Limpiando ClientView...');
        await prisma.$executeRaw`DELETE FROM "ClientView"`;
        
        // 2. Obtener TODOS los chats usando el máximo permitido (500)
        console.log('\n📱 Obteniendo chats de WhatsApp...\n');
        let allChats = [];
        let offset = 0;
        const batchSize = 500; // Máximo permitido
        let batchNum = 0;
        let consecutiveEmpty = 0;
        
        while (true) {
            batchNum++;
            console.log(`📦 Batch ${batchNum} (offset ${offset})...`);
            
            try {
                const response = await fetchWhapi(`/chats?count=${batchSize}&offset=${offset}`);
                
                if (!response.chats || response.chats.length === 0) {
                    consecutiveEmpty++;
                    console.log(`  • Sin chats en este batch`);
                    
                    // Si tenemos 2 batches vacíos consecutivos, terminamos
                    if (consecutiveEmpty >= 2) {
                        console.log('  • Fin de los chats (2 batches vacíos consecutivos)');
                        break;
                    }
                } else {
                    consecutiveEmpty = 0;
                    allChats = allChats.concat(response.chats);
                    
                    // Contar cuántos tienen mensajes en este batch
                    const withMessages = response.chats.filter(c => 
                        c.last_message && !c.id?.includes('@broadcast')
                    ).length;
                    
                    console.log(`  ✓ ${response.chats.length} chats obtenidos (${withMessages} con mensajes)`);
                    console.log(`  • Total acumulado: ${allChats.length}`);
                    
                    // Si obtenemos menos del batch size, probablemente es el último
                    if (response.chats.length < batchSize) {
                        console.log('  • Último batch (menos de 500 chats)');
                        break;
                    }
                }
                
                offset += batchSize;
                
                // Pequeña pausa para no saturar la API
                await new Promise(r => setTimeout(r, 500));
                
                // Límite de seguridad (no más de 10,000 chats)
                if (offset >= 10000) {
                    console.log('\n⚠️ Alcanzado límite de seguridad (10,000 chats)');
                    break;
                }
                
            } catch (error) {
                console.error(`  ❌ Error en batch ${batchNum}:`, error.message);
                consecutiveEmpty++;
                
                if (consecutiveEmpty >= 2) {
                    console.log('  • Terminando debido a errores consecutivos');
                    break;
                }
            }
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log(`📊 TOTAL DE CHATS OBTENIDOS: ${allChats.length}`);
        
        // 3. Filtrar solo los que tienen mensajes
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
        
        console.log('\n📊 Análisis de chats:');
        console.log(`  ✅ CON mensajes: ${chatsWithMessages.length}`);
        console.log(`  ❌ SIN mensajes: ${chatsWithoutMessages.length}`);
        console.log(`  📢 Broadcasts: ${allChats.filter(c => c.id?.includes('@broadcast')).length}`);
        console.log(`  👥 Grupos: ${allChats.filter(c => c.id?.includes('@g.us')).length}`);
        
        // 4. Insertar en la base de datos
        console.log('\n💾 Insertando chats con mensajes en ClientView...');
        let inserted = 0;
        let errors = 0;
        let withLabels = 0;
        let withNames = 0;
        
        // Procesar en batches para mostrar progreso
        const insertBatchSize = 50;
        for (let i = 0; i < chatsWithMessages.length; i += insertBatchSize) {
            const batch = chatsWithMessages.slice(i, i + insertBatchSize);
            
            for (const chat of batch) {
                try {
                    // Extraer datos
                    let phoneNumber = chat.id.replace('@s.whatsapp.net', '').replace('@g.us', '');
                    
                    // Etiquetas
                    let labels = null;
                    if (chat.labels && Array.isArray(chat.labels) && chat.labels.length > 0) {
                        labels = chat.labels.map(l => l.name).join(', ');
                        withLabels++;
                    }
                    
                    // Nombre
                    if (chat.name) withNames++;
                    
                    // Fecha
                    const lastActivity = chat.last_message.timestamp 
                        ? new Date(chat.last_message.timestamp * 1000)
                        : new Date();
                    
                    // Insertar
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
                    
                } catch (error) {
                    errors++;
                    if (errors <= 5) {
                        console.error(`  ❌ Error con ${chat.name || chat.id}:`, error.message);
                    }
                }
            }
            
            // Mostrar progreso
            console.log(`  • Procesados: ${Math.min(i + insertBatchSize, chatsWithMessages.length)}/${chatsWithMessages.length}`);
        }
        
        // 5. Estadísticas finales
        console.log('\n' + '=' .repeat(60));
        console.log('✅ SINCRONIZACIÓN COMPLETADA');
        console.log('\n📊 Resumen:');
        console.log(`  • Chats totales obtenidos: ${allChats.length}`);
        console.log(`  • Chats con mensajes: ${chatsWithMessages.length}`);
        console.log(`  • Insertados en BD: ${inserted}`);
        console.log(`  • Con etiquetas: ${withLabels}`);
        console.log(`  • Con nombres: ${withNames}`);
        console.log(`  • Errores: ${errors}`);
        
        // Verificar en BD
        const dbStats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN "chatId" LIKE '%@g.us' THEN 1 END) as grupos,
                COUNT(CASE WHEN "chatId" NOT LIKE '%@g.us' THEN 1 END) as contactos,
                COUNT("labels") as con_etiquetas,
                COUNT("name") as con_nombre,
                MIN("lastActivity") as primera_actividad,
                MAX("lastActivity") as ultima_actividad
            FROM "ClientView"
        `;
        
        console.log('\n📊 Estado final en base de datos:');
        console.table(dbStats);
        
        // Mostrar distribución temporal
        const timeStats = await prisma.$queryRaw`
            SELECT 
                COUNT(CASE WHEN "lastActivity" >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as ultima_semana,
                COUNT(CASE WHEN "lastActivity" >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as ultimo_mes,
                COUNT(CASE WHEN "lastActivity" >= CURRENT_DATE - INTERVAL '90 days' THEN 1 END) as ultimos_3_meses,
                COUNT(CASE WHEN "lastActivity" >= CURRENT_DATE - INTERVAL '365 days' THEN 1 END) as ultimo_año,
                COUNT(*) as total_historico
            FROM "ClientView"
        `;
        
        console.log('\n📈 Distribución temporal:');
        console.table(timeStats);
        
        // Top 10 más recientes
        const topRecent = await prisma.$queryRaw`
            SELECT 
                COALESCE("name", "phoneNumber") as contacto,
                "labels" as etiquetas,
                TO_CHAR("lastActivity", 'DD/MM/YYYY HH24:MI') as ultimo_mensaje
            FROM "ClientView"
            ORDER BY "lastActivity" DESC
            LIMIT 10
        `;
        
        console.log('\n🔥 Últimos 10 chats activos:');
        console.table(topRecent);
        
        console.log('\n' + '=' .repeat(60));
        console.log('💡 ClientView actualizada con TODOS los chats que tienen mensajes');
        
    } catch (error) {
        console.error('❌ Error general:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
syncAllChatsComplete();