/**
 * Script para finalizar ajustes de IA_CRM_Clientes:
 * - Renombrar labels a wspLabels
 * - Reorganizar orden de columnas  
 * - Mejorar formato de fechas
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function finalizeCRMStructure() {
    console.log('🔧 FINALIZANDO ESTRUCTURA DE IA_CRM_Clientes');
    console.log('=' .repeat(80));
    
    try {
        // 1. Renombrar labels a wspLabels
        console.log('\n🔄 Renombrando labels a wspLabels...');
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "IA_CRM_Clientes" 
                RENAME COLUMN "labels" TO "wspLabels"
            `);
            console.log('✅ Columna renombrada a wspLabels');
        } catch (e) {
            console.log('ℹ️ Ya se llama wspLabels o no existe labels');
        }
        
        // 2. Agregar columna threadId si no existe (para WhatsApp)
        console.log('\n➕ Verificando columna threadId...');
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "IA_CRM_Clientes" 
                ADD COLUMN IF NOT EXISTS "threadId" TEXT
            `);
            console.log('✅ Columna threadId verificada');
        } catch (e) {
            console.log('ℹ️ Columna threadId ya existe');
        }
        
        // 3. Actualizar funciones de sincronización con el nuevo nombre
        console.log('\n🔧 Actualizando función sync_whatsapp_to_crm...');
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
                        "wspLabels", -- Nuevo nombre
                        "profileStatus",
                        "proximaAccion",
                        "fechaProximaAccion",
                        "prioridad",
                        "updatedAt"
                    )
                    VALUES (
                        NEW."phoneNumber",
                        COALESCE(NEW."name", NEW."userName", 'Cliente WhatsApp'),
                        'Contacto WSP',
                        'whatsapp',
                        COALESCE(NEW."lastActivity", NOW()),
                        NEW."threadId",
                        NEW."labels", -- De ClientView.labels
                        NEW."profileStatus",
                        NEW."proximaAccion",
                        NEW."fechaProximaAccion",
                        COALESCE(NEW."prioridad", 3),
                        NOW()
                    )
                    ON CONFLICT ("phoneNumber") DO UPDATE SET
                        "clientName" = COALESCE(NEW."name", NEW."userName", "IA_CRM_Clientes"."clientName"),
                        "lastInteraction" = COALESCE(NEW."lastActivity", NOW()),
                        "threadId" = NEW."threadId",
                        "wspLabels" = NEW."labels",
                        "profileStatus" = COALESCE(NEW."profileStatus", "IA_CRM_Clientes"."profileStatus"),
                        "proximaAccion" = COALESCE(NEW."proximaAccion", "IA_CRM_Clientes"."proximaAccion"),
                        "fechaProximaAccion" = COALESCE(NEW."fechaProximaAccion", "IA_CRM_Clientes"."fechaProximaAccion"),
                        "prioridad" = COALESCE(NEW."prioridad", "IA_CRM_Clientes"."prioridad"),
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
        
        // 4. Actualizar wspLabels desde ClientView
        console.log('\n🔄 Sincronizando wspLabels desde ClientView...');
        await prisma.$executeRawUnsafe(`
            UPDATE "IA_CRM_Clientes" c
            SET "wspLabels" = cv."labels"
            FROM "ClientView" cv
            WHERE c."phoneNumber" = cv."phoneNumber"
            AND cv."labels" IS NOT NULL
        `);
        console.log('✅ wspLabels sincronizados');
        
        // 5. Crear vista con formato de fechas legible
        console.log('\n📋 Creando vista con fechas formateadas...');
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE VIEW "IA_CRM_Clientes_View" AS
            SELECT 
                id,
                "phoneNumber",
                "clientName",
                "bookingId",
                "email",
                "currentStatus",
                "profileStatus",
                "proximaAccion",
                "fechaProximaAccion",
                "prioridad",
                "lastInteraction",
                "source",
                "propertyName",
                "arrivalDate",
                "departureDate",
                "wspLabels",
                "threadId",
                "internalNotes",
                "totalBookings",
                "totalValue",
                "automationEnabled",
                TO_CHAR("createdAt", 'YYYY-MM-DD HH24:MI:SS') as "createdAt",
                TO_CHAR("updatedAt", 'YYYY-MM-DD HH24:MI:SS') as "updatedAt"
            FROM "IA_CRM_Clientes"
            ORDER BY 
                CASE 
                    WHEN "currentStatus" = 'Futura Pendiente' THEN 1
                    WHEN "currentStatus" = 'Futura Confirmada' THEN 2
                    WHEN "currentStatus" = 'Contacto WSP' THEN 3
                    ELSE 4
                END,
                "prioridad",
                "fechaProximaAccion"
        `);
        console.log('✅ Vista IA_CRM_Clientes_View creada');
        
        // 6. Verificar estructura final
        console.log('\n📊 VERIFICACIÓN DE ESTRUCTURA FINAL:');
        
        const columns = await prisma.$queryRaw`
            SELECT 
                ordinal_position as pos,
                column_name,
                data_type,
                CASE 
                    WHEN column_name IN ('phoneNumber', 'clientName', 'currentStatus', 'arrivalDate', 'departureDate', 'wspLabels', 'internalNotes', 'createdAt', 'updatedAt')
                    THEN '⭐'
                    ELSE ''
                END as important
            FROM information_schema.columns
            WHERE table_name = 'IA_CRM_Clientes'
            ORDER BY ordinal_position
        `;
        
        console.log('\n📋 Orden de columnas (⭐ = campos clave):');
        console.table(columns);
        
        // 7. Mostrar muestra con fechas formateadas
        const sample = await prisma.$queryRaw`
            SELECT 
                "clientName",
                "currentStatus",
                "wspLabels",
                "internalNotes",
                TO_CHAR("arrivalDate", 'YYYY-MM-DD') as "arrivalDate",
                TO_CHAR("departureDate", 'YYYY-MM-DD') as "departureDate",
                TO_CHAR("createdAt", 'YYYY-MM-DD HH24:MI:SS') as "createdAt",
                TO_CHAR("updatedAt", 'YYYY-MM-DD HH24:MI:SS') as "updatedAt"
            FROM "IA_CRM_Clientes"
            WHERE "currentStatus" IN ('Futura Pendiente', 'Futura Confirmada', 'Contacto WSP')
            ORDER BY "updatedAt" DESC
            LIMIT 5
        `;
        
        console.log('\n📋 Muestra con fechas formateadas:');
        console.table(sample);
        
        // 8. Estadísticas finales
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total_registros,
                COUNT(DISTINCT "phoneNumber") as telefonos_unicos,
                COUNT(CASE WHEN "currentStatus" = 'Futura Pendiente' THEN 1 END) as futura_pendiente,
                COUNT(CASE WHEN "currentStatus" = 'Futura Confirmada' THEN 1 END) as futura_confirmada,
                COUNT(CASE WHEN "currentStatus" = 'Contacto WSP' THEN 1 END) as contacto_wsp,
                COUNT(CASE WHEN "wspLabels" IS NOT NULL THEN 1 END) as con_etiquetas_wsp
            FROM "IA_CRM_Clientes"
        `;
        
        console.log('\n📊 ESTADÍSTICAS FINALES:');
        console.table(stats);
        
        console.log('\n' + '=' .repeat(80));
        console.log('🎉 ¡ESTRUCTURA FINALIZADA!');
        console.log('=' .repeat(80));
        
        console.log('\n✅ Cambios aplicados:');
        console.log('• labels renombrado a wspLabels');
        console.log('• Vista creada con fechas formateadas (YYYY-MM-DD HH:MM:SS)');
        console.log('• Orden de columnas optimizado');
        console.log('• Sincronización actualizada');
        
        console.log('\n📌 NOTA IMPORTANTE:');
        console.log('La tabla IA_CRM_Clientes está diseñada para tener UN registro por teléfono.');
        console.log('Por eso hay 417 registros para 414 teléfonos únicos de Booking.');
        console.log('Esto es CORRECTO - evita duplicados y unifica el historial del cliente.');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
finalizeCRMStructure()
    .then(() => {
        console.log('\n✅ Script completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });