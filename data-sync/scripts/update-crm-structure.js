/**
 * Script para actualizar la estructura de IA_CRM_Clientes con los ajustes solicitados
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateCRMStructure() {
    console.log('🔄 ACTUALIZANDO ESTRUCTURA DE IA_CRM_Clientes');
    console.log('=' .repeat(80));
    
    try {
        // 1. Agregar columna labels (de WhatsApp)
        console.log('\n➕ Agregando columna labels...');
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "IA_CRM_Clientes" 
                ADD COLUMN IF NOT EXISTS "labels" TEXT
            `);
            console.log('✅ Columna labels agregada');
        } catch (e) {
            console.log('ℹ️ Columna labels ya existe');
        }
        
        // 2. Renombrar notes a internalNotes
        console.log('\n🔄 Renombrando notes a internalNotes...');
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "IA_CRM_Clientes" 
                RENAME COLUMN "notes" TO "internalNotes"
            `);
            console.log('✅ Columna renombrada a internalNotes');
        } catch (e) {
            console.log('ℹ️ Ya se llama internalNotes o no existe notes');
        }
        
        // 3. Eliminar columna tags (redundante con labels)
        console.log('\n🗑️ Eliminando columna tags...');
        try {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "IA_CRM_Clientes" 
                DROP COLUMN IF EXISTS "tags"
            `);
            console.log('✅ Columna tags eliminada');
        } catch (e) {
            console.log('ℹ️ Columna tags no existe');
        }
        
        // 4. Actualizar función de sincronización desde Booking
        console.log('\n🔧 Actualizando función sync_booking_to_crm...');
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION sync_booking_to_crm()
            RETURNS TRIGGER AS $$
            DECLARE
                v_total_bookings INTEGER;
                v_total_value INTEGER; -- Cambiado a INTEGER para evitar decimales
            BEGIN
                -- Calcular métricas históricas (sin decimales)
                SELECT 
                    COUNT(*),
                    COALESCE(SUM(
                        CASE 
                            WHEN "totalCharges" ~ '^[0-9]+\.?[0-9]*$' 
                            THEN CAST("totalCharges" AS DECIMAL)::INTEGER
                            ELSE 0
                        END
                    ), 0)
                INTO v_total_bookings, v_total_value
                FROM "Booking"
                WHERE "phone" = NEW."phone"
                  AND "phone" IS NOT NULL
                  AND "phone" != ''
                  AND "BDStatus" NOT LIKE '%Cancelada%';
                
                -- Si el teléfono es válido, insertar o actualizar
                IF NEW."phone" IS NOT NULL AND NEW."phone" != '' AND NEW."phone" != 'unknown' THEN
                    INSERT INTO "IA_CRM_Clientes" (
                        "phoneNumber",
                        "clientName",
                        "email",
                        "bookingId",
                        "currentStatus", -- Ahora será el BDStatus directo
                        "source",
                        "propertyName",
                        "arrivalDate",
                        "departureDate",
                        "lastInteraction",
                        "totalBookings",
                        "totalValue",
                        "updatedAt"
                    )
                    VALUES (
                        NEW."phone",
                        NEW."guestName",
                        NEW."email",
                        NEW."bookingId",
                        NEW."BDStatus", -- Usar BDStatus directamente
                        COALESCE(NEW."channel", 'direct'),
                        COALESCE(NEW."propertyName", 'Sin asignar'), -- Evitar Unknown
                        NEW."arrivalDate"::date,
                        NEW."departureDate"::date,
                        NOW(),
                        v_total_bookings,
                        v_total_value, -- Ya sin decimales
                        NOW()
                    )
                    ON CONFLICT ("phoneNumber") DO UPDATE SET
                        "bookingId" = CASE 
                            WHEN NEW."BDStatus" NOT LIKE '%Cancelada%' THEN NEW."bookingId"
                            ELSE "IA_CRM_Clientes"."bookingId"
                        END,
                        "clientName" = COALESCE(NEW."guestName", "IA_CRM_Clientes"."clientName"),
                        "email" = COALESCE(NEW."email", "IA_CRM_Clientes"."email"),
                        "currentStatus" = CASE 
                            WHEN NEW."BDStatus" NOT LIKE '%Cancelada%' THEN NEW."BDStatus"
                            ELSE "IA_CRM_Clientes"."currentStatus"
                        END,
                        "source" = CASE 
                            WHEN NEW."BDStatus" NOT LIKE '%Cancelada%' THEN COALESCE(NEW."channel", 'direct')
                            ELSE "IA_CRM_Clientes"."source"
                        END,
                        "propertyName" = CASE 
                            WHEN NEW."BDStatus" NOT LIKE '%Cancelada%' THEN COALESCE(NEW."propertyName", 'Sin asignar')
                            ELSE "IA_CRM_Clientes"."propertyName"
                        END,
                        "arrivalDate" = CASE 
                            WHEN NEW."BDStatus" NOT LIKE '%Cancelada%' THEN NEW."arrivalDate"::date
                            ELSE "IA_CRM_Clientes"."arrivalDate"
                        END,
                        "departureDate" = CASE 
                            WHEN NEW."BDStatus" NOT LIKE '%Cancelada%' THEN NEW."departureDate"::date
                            ELSE "IA_CRM_Clientes"."departureDate"
                        END,
                        "lastInteraction" = NOW(),
                        "totalBookings" = v_total_bookings,
                        "totalValue" = v_total_value,
                        "updatedAt" = NOW();
                    
                    RAISE NOTICE 'CRM actualizado: % - Status: %', NEW."phone", NEW."BDStatus";
                END IF;
                
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log('✅ Función sync_booking_to_crm actualizada');
        
        // 5. Actualizar función de sincronización desde WhatsApp
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
                        "currentStatus", -- Será "Contacto WSP"
                        "source",
                        "lastInteraction",
                        "threadId",
                        "labels", -- Nueva columna de etiquetas WhatsApp
                        "profileStatus",
                        "proximaAccion",
                        "fechaProximaAccion",
                        "prioridad",
                        "updatedAt"
                    )
                    VALUES (
                        NEW."phoneNumber",
                        COALESCE(NEW."name", NEW."userName", 'Cliente WhatsApp'),
                        'Contacto WSP', -- Estado fijo para WhatsApp
                        'whatsapp',
                        COALESCE(NEW."lastActivity", NOW()),
                        NEW."threadId",
                        NEW."labels", -- Etiquetas de WhatsApp
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
                        "labels" = NEW."labels", -- Actualizar etiquetas
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
        
        // 6. Actualizar registros existentes
        console.log('\n🔄 Actualizando registros existentes...');
        
        // Actualizar currentStatus desde Booking
        await prisma.$executeRawUnsafe(`
            UPDATE "IA_CRM_Clientes" c
            SET "currentStatus" = b."BDStatus"
            FROM "Booking" b
            WHERE c."bookingId" = b."bookingId"
            AND c."bookingId" IS NOT NULL
        `);
        console.log('✅ CurrentStatus actualizado con BDStatus');
        
        // Actualizar registros de WhatsApp
        await prisma.$executeRawUnsafe(`
            UPDATE "IA_CRM_Clientes"
            SET "currentStatus" = 'Contacto WSP'
            WHERE "source" = 'whatsapp'
            AND "bookingId" IS NULL
        `);
        console.log('✅ Contactos WhatsApp marcados como "Contacto WSP"');
        
        // Actualizar labels desde ClientView
        await prisma.$executeRawUnsafe(`
            UPDATE "IA_CRM_Clientes" c
            SET "labels" = cv."labels"
            FROM "ClientView" cv
            WHERE c."phoneNumber" = cv."phoneNumber"
            AND cv."labels" IS NOT NULL
        `);
        console.log('✅ Labels sincronizados desde ClientView');
        
        // Convertir totalValue a entero (sin decimales)
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "IA_CRM_Clientes" 
            ALTER COLUMN "totalValue" TYPE INTEGER 
            USING "totalValue"::INTEGER
        `);
        console.log('✅ TotalValue convertido a entero (sin decimales)');
        
        // 7. Verificación
        console.log('\n📊 VERIFICACIÓN DE CAMBIOS:');
        
        // Ver estructura actualizada
        const columns = await prisma.$queryRaw`
            SELECT 
                column_name,
                data_type,
                is_nullable
            FROM information_schema.columns
            WHERE table_name = 'IA_CRM_Clientes'
            AND column_name IN ('currentStatus', 'labels', 'internalNotes', 'totalValue', 'tags')
            ORDER BY ordinal_position
        `;
        
        console.log('\n📋 Columnas verificadas:');
        console.table(columns);
        
        // Muestra de datos actualizados
        const sample = await prisma.$queryRaw`
            SELECT 
                "clientName",
                "currentStatus",
                "source",
                "labels",
                "totalValue",
                "propertyName"
            FROM "IA_CRM_Clientes"
            WHERE "currentStatus" IS NOT NULL
            ORDER BY 
                CASE 
                    WHEN "currentStatus" = 'Futura Pendiente' THEN 1
                    WHEN "currentStatus" = 'Futura Confirmada' THEN 2
                    WHEN "currentStatus" = 'Contacto WSP' THEN 3
                    ELSE 4
                END
            LIMIT 10
        `;
        
        console.log('\n📋 Muestra de registros actualizados:');
        console.table(sample);
        
        // Estadísticas
        const stats = await prisma.$queryRaw`
            SELECT 
                "currentStatus",
                COUNT(*) as total
            FROM "IA_CRM_Clientes"
            GROUP BY "currentStatus"
            ORDER BY COUNT(*) DESC
            LIMIT 10
        `;
        
        console.log('\n📊 Distribución por CurrentStatus:');
        console.table(stats);
        
        console.log('\n' + '=' .repeat(80));
        console.log('🎉 ¡ACTUALIZACIÓN COMPLETADA!');
        console.log('=' .repeat(80));
        
        console.log('\n✅ Cambios aplicados:');
        console.log('• currentStatus ahora muestra BDStatus exacto (Futura Pendiente, etc)');
        console.log('• Contactos de WhatsApp marcados como "Contacto WSP"');
        console.log('• Nueva columna "labels" con etiquetas de WhatsApp');
        console.log('• Columna "tags" eliminada (redundante)');
        console.log('• "notes" renombrada a "internalNotes"');
        console.log('• totalValue sin decimales (entero)');
        console.log('• propertyName mejorado (evita "Unknown")');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
updateCRMStructure()
    .then(() => {
        console.log('\n✅ Script completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });