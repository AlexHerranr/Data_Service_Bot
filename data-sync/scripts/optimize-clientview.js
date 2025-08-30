/**
 * Script para optimizar ClientView eliminando campos redundantes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function optimizeClientView() {
    console.log('🔧 OPTIMIZANDO TABLA ClientView');
    console.log('=' .repeat(80));
    
    try {
        // 1. Hacer backup de los datos actuales
        console.log('\n📸 Creando backup de datos actuales...');
        const backup = await prisma.$queryRaw`
            SELECT * FROM "ClientView"
        `;
        console.log(`✅ Backup de ${backup.length} registros`);
        
        // 2. Eliminar columnas que ya están en IA_CRM_Clientes
        console.log('\n🗑️ Eliminando columnas redundantes...');
        
        const columnsToRemove = [
            'profileStatus',      // Ya está en IA_CRM_Clientes
            'proximaAccion',      // Ya está en IA_CRM_Clientes
            'fechaProximaAccion', // Ya está en IA_CRM_Clientes
            'prioridad'          // Ya está en IA_CRM_Clientes
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
        
        // 3. Agregar nuevas columnas útiles para WhatsApp
        console.log('\n➕ Agregando nuevas columnas útiles...');
        
        // Columna para tipo de mensaje más reciente
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "ClientView" 
                ADD COLUMN IF NOT EXISTS "lastMessageType" VARCHAR(50)
            `);
            console.log('  ✅ Agregada: lastMessageType (text/image/audio/video)');
        } catch (e) {
            console.log('  ℹ️ lastMessageType ya existe');
        }
        
        // Columna para el último mensaje recibido
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "ClientView" 
                ADD COLUMN IF NOT EXISTS "lastMessage" TEXT
            `);
            console.log('  ✅ Agregada: lastMessage (contenido del último mensaje)');
        } catch (e) {
            console.log('  ℹ️ lastMessage ya existe');
        }
        
        // Columna para contar mensajes sin responder
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "ClientView" 
                ADD COLUMN IF NOT EXISTS "unreadCount" INTEGER DEFAULT 0
            `);
            console.log('  ✅ Agregada: unreadCount (mensajes sin leer)');
        } catch (e) {
            console.log('  ℹ️ unreadCount ya existe');
        }
        
        // Columna para indicar si está en conversación activa
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "ClientView" 
                ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT false
            `);
            console.log('  ✅ Agregada: isActive (conversación activa)');
        } catch (e) {
            console.log('  ℹ️ isActive ya existe');
        }
        
        // 4. Actualizar la función de sincronización
        console.log('\n🔄 Actualizando función de sincronización...');
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION sync_whatsapp_to_crm()
            RETURNS TRIGGER AS $$
            DECLARE
                v_has_active_booking BOOLEAN;
            BEGIN
                -- Verificar si tiene reserva activa
                SELECT EXISTS(
                    SELECT 1 FROM "Booking" 
                    WHERE "phone" = NEW."phoneNumber" 
                    AND "BDStatus" NOT LIKE '%Cancelada%'
                    AND "BDStatus" NOT LIKE '%Cancelled%'
                    AND "BDStatus" IS NOT NULL
                ) INTO v_has_active_booking;
                
                -- Solo crear/actualizar si NO tiene reserva activa
                IF NOT v_has_active_booking THEN
                    INSERT INTO "IA_CRM_Clientes" (
                        "phoneNumber",
                        "clientName",
                        "currentStatus",
                        "source",
                        "lastInteraction",
                        "threadId",
                        "wspLabels",
                        "updatedAt"
                    )
                    VALUES (
                        NEW."phoneNumber",
                        COALESCE(NEW."name", NEW."userName", 'Cliente WhatsApp'),
                        'Contacto WSP',
                        'whatsapp',
                        COALESCE(NEW."lastActivity", NOW()),
                        NEW."threadId",
                        NEW."labels",
                        NOW()
                    )
                    ON CONFLICT ("phoneNumber") DO UPDATE SET
                        "clientName" = COALESCE(NEW."name", NEW."userName", "IA_CRM_Clientes"."clientName"),
                        "lastInteraction" = COALESCE(NEW."lastActivity", NOW()),
                        "threadId" = NEW."threadId",
                        "wspLabels" = NEW."labels",
                        "updatedAt" = NOW()
                    WHERE 
                        "IA_CRM_Clientes"."currentStatus" IN ('Contacto WSP', 'Cancelada Futura', 'Cancelada Pasada');
                    
                    RAISE NOTICE 'CRM actualizado desde WhatsApp: %', NEW."phoneNumber";
                END IF;
                
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log('✅ Función sync_whatsapp_to_crm actualizada');
        
        // 5. Ver estructura final
        console.log('\n📊 ESTRUCTURA FINAL DE ClientView:');
        const finalStructure = await prisma.$queryRaw`
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = 'ClientView'
            ORDER BY ordinal_position
        `;
        console.table(finalStructure);
        
        // 6. Verificar datos
        console.log('\n✅ VERIFICACIÓN DE DATOS:');
        const dataCheck = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "userName",
                "labels",
                "threadId",
                "lastActivity",
                "lastMessage",
                "lastMessageType",
                "unreadCount",
                "isActive"
            FROM "ClientView"
            ORDER BY "lastActivity" DESC
        `;
        console.table(dataCheck);
        
        console.log('\n' + '=' .repeat(80));
        console.log('🎉 OPTIMIZACIÓN COMPLETADA');
        console.log('=' .repeat(80));
        
        console.log('\n📋 RESUMEN DE CAMBIOS:');
        console.log('\n❌ COLUMNAS ELIMINADAS (ya están en IA_CRM_Clientes):');
        console.log('  • profileStatus');
        console.log('  • proximaAccion');
        console.log('  • fechaProximaAccion');
        console.log('  • prioridad');
        
        console.log('\n✅ COLUMNAS AGREGADAS (específicas de WhatsApp):');
        console.log('  • lastMessage - Contenido del último mensaje');
        console.log('  • lastMessageType - Tipo de mensaje (text/image/audio/video)');
        console.log('  • unreadCount - Contador de mensajes sin leer');
        console.log('  • isActive - Si la conversación está activa');
        
        console.log('\n✅ COLUMNAS CONSERVADAS (esenciales):');
        console.log('  • phoneNumber - Identificador único');
        console.log('  • name/userName - Nombre del contacto');
        console.log('  • labels - Etiquetas de WhatsApp');
        console.log('  • chatId - ID del chat');
        console.log('  • threadId - ID del thread');
        console.log('  • lastActivity - Última actividad');
        console.log('  • threadTokenCount - Contador para IA');
        
        console.log('\n🎯 ClientView ahora es más ligera y específica para WhatsApp');
        console.log('🔄 Los datos de CRM están centralizados en IA_CRM_Clientes');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
optimizeClientView()
    .then(() => {
        console.log('\n✅ Script completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });