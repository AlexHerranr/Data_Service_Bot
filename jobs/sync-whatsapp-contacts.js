/**
 * Script para sincronizar contactos de WhatsApp a ClientView
 * Usa el endpoint /chats de Whapi para obtener chats recientes
 */

import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

// Configuración de Whapi
const WHAPI_BASE_URL = 'https://gate.whapi.cloud';
const WHAPI_TOKEN = process.env.WHAPI_TOKEN || 'hXoVA1qcPcFPQ0uh8AZckGzbPxquj7dZ'; // Token del ejemplo

/**
 * Obtiene chats de WhatsApp desde Whapi
 */
async function getWhatsAppChats(count = 100, offset = 0) {
    const url = `${WHAPI_BASE_URL}/chats?count=${count}&offset=${offset}`;
    
    console.log(`📱 Obteniendo chats de WhatsApp (count: ${count}, offset: ${offset})...`);
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${WHAPI_TOKEN}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('❌ Error obteniendo chats:', error.message);
        throw error;
    }
}

/**
 * Procesa y guarda los chats en ClientView
 */
async function syncChatsToClientView(chats) {
    let synced = 0;
    let errors = 0;
    
    for (const chat of chats) {
        try {
            // Extraer datos relevantes
            const phoneNumber = extractPhoneNumber(chat.id);
            if (!phoneNumber) {
                console.log(`  ⚠️ Saltando chat sin número válido: ${chat.id}`);
                continue;
            }
            
            // Preparar labels como string
            let labelsString = null;
            if (chat.labels && chat.labels.length > 0) {
                labelsString = chat.labels.map(l => l.name).join(', ');
            }
            
            // Preparar datos para ClientView
            const clientData = {
                phoneNumber: phoneNumber,
                name: chat.name || null,
                userName: extractUserName(chat),
                labels: labelsString,
                chatId: chat.id,
                lastActivity: chat.timestamp ? new Date(chat.timestamp * 1000) : new Date(),
                threadId: null, // Se llenará cuando se use con IA
                threadTokenCount: 0
            };
            
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
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT ("phoneNumber") DO UPDATE SET
                    "name" = COALESCE(EXCLUDED."name", "ClientView"."name"),
                    "userName" = COALESCE(EXCLUDED."userName", "ClientView"."userName"),
                    "labels" = EXCLUDED."labels",
                    "chatId" = EXCLUDED."chatId",
                    "lastActivity" = EXCLUDED."lastActivity"
            `,
                clientData.phoneNumber,
                clientData.name,
                clientData.userName,
                clientData.labels,
                clientData.chatId,
                clientData.lastActivity,
                clientData.threadId,
                clientData.threadTokenCount
            );
            
            synced++;
            console.log(`  ✅ ${clientData.name || clientData.userName || clientData.phoneNumber}${labelsString ? ' [' + labelsString + ']' : ''}`);
            
        } catch (error) {
            errors++;
            console.error(`  ❌ Error con chat ${chat.id}:`, error.message);
        }
    }
    
    return { synced, errors };
}

/**
 * Extrae el número de teléfono del ID del chat
 */
function extractPhoneNumber(chatId) {
    if (!chatId) return null;
    
    // Remover sufijos de WhatsApp
    let phone = chatId.replace('@s.whatsapp.net', '')
                     .replace('@g.us', '')
                     .replace('@broadcast', '');
    
    // Si es un grupo o broadcast, no lo procesamos
    if (chatId.includes('@g.us') || chatId.includes('@broadcast')) {
        // Pero si es un grupo, podríamos querer guardarlo con un identificador especial
        if (chatId.includes('@g.us')) {
            return chatId; // Guardar el ID completo del grupo
        }
        return null;
    }
    
    // Validar que sea un número
    if (!/^\d+$/.test(phone)) {
        return null;
    }
    
    return phone;
}

/**
 * Extrae el nombre de usuario del chat
 */
function extractUserName(chat) {
    // Intentar obtener del último mensaje
    if (chat.last_message && chat.last_message.from_name) {
        return chat.last_message.from_name;
    }
    
    // Si no hay nombre, usar el tipo de chat
    if (chat.type === 'group') {
        return 'Grupo';
    }
    
    return null;
}

/**
 * Función principal
 */
async function syncWhatsAppContacts() {
    console.log('🔄 SINCRONIZACIÓN DE CONTACTOS WHATSAPP → ClientView');
    console.log('=' .repeat(60));
    console.log(`📅 ${new Date().toLocaleString()}`);
    console.log(`🔑 Token: ${WHAPI_TOKEN.substring(0, 10)}...`);
    
    try {
        // 1. Obtener estado actual de ClientView
        const currentCount = await prisma.clientView.count();
        console.log(`\n📊 Estado actual de ClientView: ${currentCount} registros`);
        
        // 2. Obtener chats de WhatsApp
        console.log('\n🌐 Conectando con Whapi...');
        const response = await getWhatsAppChats(100, 0); // Obtener primeros 100 chats
        
        if (!response.chats || response.chats.length === 0) {
            console.log('⚠️ No se encontraron chats');
            return;
        }
        
        console.log(`✅ Obtenidos ${response.chats.length} chats de ${response.total} totales`);
        
        // 3. Filtrar solo chats de contactos (no grupos ni broadcasts por ahora)
        const contactChats = response.chats.filter(chat => {
            return chat.type === 'contact' || chat.type === 'group';
        });
        
        console.log(`📋 Procesando ${contactChats.length} chats (contactos y grupos)`);
        
        // 4. Sincronizar con ClientView
        console.log('\n💾 Guardando en ClientView...');
        const result = await syncChatsToClientView(contactChats);
        
        // 5. Verificar resultado final
        const finalCount = await prisma.clientView.count();
        
        // 6. Mostrar resumen
        console.log('\n' + '=' .repeat(60));
        console.log('✅ SINCRONIZACIÓN COMPLETADA');
        console.log('=' .repeat(60));
        console.log(`  • Chats procesados: ${contactChats.length}`);
        console.log(`  • Sincronizados: ${result.synced}`);
        console.log(`  • Errores: ${result.errors}`);
        console.log(`  • Total en ClientView: ${currentCount} → ${finalCount}`);
        
        // 7. Mostrar muestra de datos sincronizados
        console.log('\n📋 Muestra de contactos sincronizados:');
        const sample = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "userName",
                "labels",
                TO_CHAR("lastActivity", 'YYYY-MM-DD HH24:MI:SS') as "lastActivity"
            FROM "ClientView"
            ORDER BY "lastActivity" DESC
            LIMIT 10
        `;
        console.table(sample);
        
        // 8. Si hay más chats disponibles, informar
        if (response.total > response.count) {
            console.log(`\nℹ️ Hay ${response.total - response.count} chats adicionales disponibles`);
            console.log('   Para sincronizar todos, ejecutar con --all');
        }
        
    } catch (error) {
        console.error('\n❌ ERROR GENERAL:', error.message);
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

/**
 * Sincronizar TODOS los chats (paginando)
 */
async function syncAllChats() {
    console.log('🔄 SINCRONIZACIÓN COMPLETA DE TODOS LOS CHATS');
    console.log('=' .repeat(60));
    
    try {
        let offset = 0;
        const batchSize = 100;
        let totalSynced = 0;
        let hasMore = true;
        
        while (hasMore) {
            console.log(`\n📦 Batch ${offset / batchSize + 1}...`);
            
            const response = await getWhatsAppChats(batchSize, offset);
            
            if (!response.chats || response.chats.length === 0) {
                hasMore = false;
                break;
            }
            
            const contactChats = response.chats.filter(chat => {
                return chat.type === 'contact' || chat.type === 'group';
            });
            
            const result = await syncChatsToClientView(contactChats);
            totalSynced += result.synced;
            
            offset += batchSize;
            hasMore = offset < response.total;
            
            // Pequeña pausa para no sobrecargar
            if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log(`✅ SINCRONIZACIÓN COMPLETA: ${totalSynced} contactos`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

// Manejar argumentos de línea de comandos
const args = process.argv.slice(2);

if (args.includes('--all')) {
    // Sincronizar todos los chats
    syncAllChats();
} else if (args.includes('--help')) {
    console.log('📚 USO:');
    console.log('  node sync-whatsapp-contacts.js         # Sincronizar primeros 100');
    console.log('  node sync-whatsapp-contacts.js --all   # Sincronizar todos');
    console.log('  node sync-whatsapp-contacts.js --help  # Ver ayuda');
    console.log('\n⚙️ Configuración:');
    console.log('  WHAPI_TOKEN: Variable de entorno con el token de Whapi');
} else {
    // Por defecto, sincronizar primeros 100
    syncWhatsAppContacts();
}