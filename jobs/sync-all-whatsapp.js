/**
 * Script para sincronizar TODOS los contactos de WhatsApp (paginando)
 */

import { PrismaClient } from '@prisma/client';
import https from 'https';

const prisma = new PrismaClient();
const WHAPI_TOKEN = process.env.WHAPI_TOKEN || 'hXoVA1qcPcFPQ0uh8AZckGzbPxquj7dZ';

function fetchWhapi(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'gate.whapi.cloud',
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${WHAPI_TOKEN}`
            }
        };
        
        https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    res.statusCode === 200 ? resolve(json) : reject(new Error(`API Error: ${res.statusCode}`));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject).end();
    });
}

async function syncAllWhatsApp() {
    console.log('🔄 SINCRONIZACIÓN COMPLETA DE WHATSAPP → ClientView');
    console.log('=' .repeat(60));
    
    try {
        let offset = 0;
        const batchSize = 100;
        let totalSynced = 0;
        let totalSkipped = 0;
        let hasMore = true;
        let batchNum = 1;
        
        while (hasMore) {
            console.log(`\n📦 Batch ${batchNum} (offset: ${offset})...`);
            
            // Obtener batch de chats
            const response = await fetchWhapi(`/chats?count=${batchSize}&offset=${offset}`);
            
            if (!response.chats || response.chats.length === 0) {
                hasMore = false;
                break;
            }
            
            console.log(`  Obtenidos ${response.chats.length} chats`);
            
            // Procesar cada chat
            let batchSynced = 0;
            for (const chat of response.chats) {
                try {
                    // Saltar broadcasts y status
                    if (chat.id.includes('@broadcast') || chat.id === 'status@broadcast') {
                        totalSkipped++;
                        continue;
                    }
                    
                    // Extraer datos
                    let phoneNumber = chat.id
                        .replace('@s.whatsapp.net', '')
                        .replace('@g.us', '');
                    
                    if (chat.id.includes('@g.us')) {
                        phoneNumber = chat.id;
                    }
                    
                    const labelsString = chat.labels?.length > 0 
                        ? chat.labels.map(l => l.name).join(', ') 
                        : null;
                    
                    const lastActivity = chat.timestamp 
                        ? new Date(chat.timestamp * 1000) 
                        : new Date();
                    
                    // Guardar en BD
                    await prisma.$executeRawUnsafe(`
                        INSERT INTO "ClientView" (
                            "phoneNumber", "name", "userName", "labels",
                            "chatId", "lastActivity", "threadId", "threadTokenCount"
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, NULL, 0)
                        ON CONFLICT ("phoneNumber") DO UPDATE SET
                            "name" = COALESCE($2, "ClientView"."name"),
                            "userName" = COALESCE($3, "ClientView"."userName"),
                            "labels" = $4,
                            "chatId" = $5,
                            "lastActivity" = $6
                        WHERE "ClientView"."lastActivity" < $6
                    `,
                        phoneNumber,
                        chat.name || null,
                        chat.last_message?.from_name || null,
                        labelsString,
                        chat.id,
                        lastActivity
                    );
                    
                    batchSynced++;
                    totalSynced++;
                    
                } catch (error) {
                    console.error(`  ❌ Error: ${error.message}`);
                }
            }
            
            console.log(`  ✅ Sincronizados: ${batchSynced}`);
            
            // Preparar siguiente batch
            offset += batchSize;
            hasMore = offset < response.total;
            batchNum++;
            
            // Pausa entre batches
            if (hasMore) {
                console.log('  ⏳ Esperando 1 segundo...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // Resumen final
        console.log('\n' + '=' .repeat(60));
        console.log('✅ SINCRONIZACIÓN COMPLETA');
        console.log('=' .repeat(60));
        console.log(`  • Total sincronizados: ${totalSynced}`);
        console.log(`  • Saltados (broadcast): ${totalSkipped}`);
        
        // Estado final
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN "chatId" LIKE '%@g.us' THEN 1 END) as grupos,
                COUNT(CASE WHEN "labels" IS NOT NULL THEN 1 END) as con_etiquetas
            FROM "ClientView"
        `;
        
        console.log('\n📊 Estado final de ClientView:');
        console.table(stats);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

syncAllWhatsApp();