/**
 * Script simplificado para sincronizar contactos de WhatsApp a ClientView
 * Sin dependencias externas (usa https nativo de Node.js)
 */

import { PrismaClient } from '@prisma/client';
import https from 'https';

const prisma = new PrismaClient();

// Configuración de Whapi
const WHAPI_TOKEN = process.env.WHAPI_TOKEN || 'hXoVA1qcPcFPQ0uh8AZckGzbPxquj7dZ';

/**
 * Hace una petición GET a Whapi
 */
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
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode === 200) {
                        resolve(json);
                    } else {
                        reject(new Error(`API Error: ${res.statusCode} - ${json.error?.message || 'Unknown error'}`));
                    }
                } catch (e) {
                    reject(new Error(`Parse error: ${e.message}`));
                }
            });
        });
        
        req.on('error', (e) => {
            reject(new Error(`Request error: ${e.message}`));
        });
        
        req.end();
    });
}

/**
 * Función principal de sincronización
 */
async function syncWhatsApp() {
    console.log('🔄 SINCRONIZACIÓN DE WHATSAPP → ClientView');
    console.log('=' .repeat(60));
    console.log(`📅 ${new Date().toLocaleString()}`);
    
    try {
        // 1. Obtener chats de WhatsApp
        console.log('\n📱 Obteniendo chats de WhatsApp...');
        const response = await fetchWhapi('/chats?count=50');
        
        if (!response.chats || response.chats.length === 0) {
            console.log('⚠️ No se encontraron chats');
            return;
        }
        
        console.log(`✅ Obtenidos ${response.chats.length} chats`);
        
        // 2. Procesar cada chat
        console.log('\n💾 Procesando contactos...');
        let synced = 0;
        let skipped = 0;
        
        for (const chat of response.chats) {
            try {
                // Saltar broadcasts y status
                if (chat.id.includes('@broadcast') || chat.id === 'status@broadcast') {
                    skipped++;
                    continue;
                }
                
                // Extraer número de teléfono
                let phoneNumber = chat.id
                    .replace('@s.whatsapp.net', '')
                    .replace('@g.us', '');
                
                // Para grupos, usar el ID completo
                if (chat.id.includes('@g.us')) {
                    phoneNumber = chat.id;
                }
                
                // Preparar labels
                let labelsString = null;
                if (chat.labels && chat.labels.length > 0) {
                    labelsString = chat.labels.map(l => l.name).join(', ');
                }
                
                // Preparar nombre
                const name = chat.name || null;
                const userName = chat.last_message?.from_name || null;
                
                // Fecha de última actividad
                const lastActivity = chat.timestamp 
                    ? new Date(chat.timestamp * 1000) 
                    : new Date();
                
                // Insertar o actualizar en ClientView
                await prisma.$executeRawUnsafe(`
                    INSERT INTO "ClientView" (
                        "phoneNumber",
                        "name",
                        "userName",
                        "labels",
                        "chatId",
                        "lastActivity",
                        "threadId",
                        "threadTokenCount"
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, NULL, 0)
                    ON CONFLICT ("phoneNumber") DO UPDATE SET
                        "name" = COALESCE($2, "ClientView"."name"),
                        "userName" = COALESCE($3, "ClientView"."userName"),
                        "labels" = $4,
                        "chatId" = $5,
                        "lastActivity" = $6
                    WHERE "ClientView"."chatId" IS DISTINCT FROM $5
                       OR "ClientView"."lastActivity" < $6
                `,
                    phoneNumber,
                    name,
                    userName,
                    labelsString,
                    chat.id,
                    lastActivity
                );
                
                synced++;
                
                // Mostrar progreso
                const displayName = name || userName || phoneNumber;
                const type = chat.type === 'group' ? '👥' : '👤';
                const labels = labelsString ? ` [${labelsString}]` : '';
                console.log(`  ${type} ${displayName}${labels}`);
                
            } catch (error) {
                console.error(`  ❌ Error con ${chat.id}: ${error.message}`);
            }
        }
        
        // 3. Mostrar resumen
        console.log('\n' + '=' .repeat(60));
        console.log('📊 RESUMEN:');
        console.log(`  • Total chats obtenidos: ${response.chats.length}`);
        console.log(`  • Contactos/Grupos sincronizados: ${synced}`);
        console.log(`  • Saltados (broadcast/status): ${skipped}`);
        
        if (response.total > response.chats.length) {
            console.log(`  • Chats adicionales disponibles: ${response.total - response.chats.length}`);
        }
        
        // 4. Mostrar estado actual de ClientView
        console.log('\n📋 Estado actual de ClientView:');
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN "chatId" LIKE '%@g.us' THEN 1 END) as grupos,
                COUNT(CASE WHEN "chatId" NOT LIKE '%@g.us' THEN 1 END) as contactos,
                COUNT(CASE WHEN "labels" IS NOT NULL THEN 1 END) as con_etiquetas
            FROM "ClientView"
        `;
        console.table(stats);
        
        // 5. Mostrar últimos contactos sincronizados
        console.log('\n📱 Últimos contactos sincronizados:');
        const recent = await prisma.$queryRaw`
            SELECT 
                CASE 
                    WHEN "chatId" LIKE '%@g.us' THEN '👥'
                    ELSE '👤'
                END as tipo,
                COALESCE("name", "userName", "phoneNumber") as nombre,
                "labels",
                TO_CHAR("lastActivity", 'YYYY-MM-DD HH24:MI') as ultima_actividad
            FROM "ClientView"
            ORDER BY "lastActivity" DESC
            LIMIT 10
        `;
        console.table(recent);
        
        console.log('\n✅ Sincronización completada exitosamente');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
syncWhatsApp();