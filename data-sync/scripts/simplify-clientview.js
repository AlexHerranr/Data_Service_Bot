/**
 * Script para simplificar ClientView dejando solo campos esenciales
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function simplifyClientView() {
    console.log('🎯 SIMPLIFICANDO ClientView - Solo campos esenciales');
    console.log('=' .repeat(80));
    
    try {
        // 1. Eliminar las columnas agregadas que no necesitamos
        console.log('\n🗑️ Eliminando columnas innecesarias...');
        
        const columnsToRemove = [
            'lastMessage',      // No necesaria
            'lastMessageType',  // No necesaria
            'unreadCount',      // No necesaria
            'isActive'          // No necesaria
        ];
        
        for (const column of columnsToRemove) {
            try {
                await prisma.$executeRawUnsafe(`
                    ALTER TABLE "ClientView" 
                    DROP COLUMN IF EXISTS "${column}"
                `);
                console.log(`  ✅ Eliminada: ${column}`);
            } catch (e) {
                console.log(`  ℹ️ ${column}: ${e.message}`);
            }
        }
        
        // 2. Verificar estructura final
        console.log('\n📊 ESTRUCTURA FINAL DE ClientView (SIMPLIFICADA):');
        const finalStructure = await prisma.$queryRaw`
            SELECT 
                ordinal_position as pos,
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = 'ClientView'
            ORDER BY ordinal_position
        `;
        console.table(finalStructure);
        
        // 3. Verificar datos actuales
        console.log('\n✅ DATOS ACTUALES:');
        const currentData = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "userName",
                "labels",
                "chatId",
                "threadId",
                "threadTokenCount",
                TO_CHAR("lastActivity", 'YYYY-MM-DD HH24:MI:SS') as "lastActivity"
            FROM "ClientView"
            ORDER BY "lastActivity" DESC
        `;
        console.table(currentData);
        
        // 4. Verificar sincronización con CRM
        console.log('\n🔄 SINCRONIZACIÓN CON IA_CRM_Clientes:');
        const syncStatus = await prisma.$queryRaw`
            SELECT 
                cv."phoneNumber",
                cv."name" as "whatsapp_name",
                crm."clientName" as "crm_name",
                crm."currentStatus",
                crm."wspLabels"
            FROM "ClientView" cv
            LEFT JOIN "IA_CRM_Clientes" crm ON cv."phoneNumber" = crm."phoneNumber"
        `;
        console.table(syncStatus);
        
        console.log('\n' + '=' .repeat(80));
        console.log('✅ SIMPLIFICACIÓN COMPLETADA');
        console.log('=' .repeat(80));
        
        console.log('\n📋 CAMPOS FINALES DE ClientView:');
        console.log('  1️⃣ phoneNumber - Identificador único');
        console.log('  2️⃣ name - Nombre del contacto');
        console.log('  3️⃣ userName - Nombre de usuario WhatsApp');
        console.log('  4️⃣ labels - Etiquetas de WhatsApp');
        console.log('  5️⃣ chatId - ID único del chat');
        console.log('  6️⃣ threadId - ID del thread de conversación');
        console.log('  7️⃣ lastActivity - Última actividad');
        console.log('  8️⃣ threadTokenCount - Contador para IA');
        
        console.log('\n🎯 Beneficios:');
        console.log('  • Tabla minimalista y eficiente');
        console.log('  • Solo datos esenciales de WhatsApp');
        console.log('  • Sin duplicación con IA_CRM_Clientes');
        console.log('  • Sincronización automática funcionando');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
simplifyClientView()
    .then(() => {
        console.log('\n✅ Script completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });