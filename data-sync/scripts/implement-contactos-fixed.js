/**
 * Script para implementar la tabla maestra CONTACTOS
 * Versión corregida con comandos SQL separados
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function implementContactosTable() {
    console.log('🚀 IMPLEMENTACIÓN DE TABLA CONTACTOS');
    console.log('=' .repeat(60));
    
    let stepsCompleted = 0;
    
    try {
        // 1. CREAR TABLA CONTACTOS
        console.log('\n📊 [1/10] Creando tabla Contactos...');
        
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "Contactos" (
                "id" SERIAL PRIMARY KEY,
                "phoneNumber" VARCHAR(20) UNIQUE NOT NULL,
                "name" VARCHAR(255),
                "email" VARCHAR(255),
                "whatsappChatId" VARCHAR(100) UNIQUE,
                "whatsappLabels" TEXT,
                "lastWhatsappMsg" TIMESTAMP,
                "hasWhatsapp" BOOLEAN DEFAULT false,
                "totalBookings" INTEGER DEFAULT 0,
                "confirmedBookings" INTEGER DEFAULT 0,
                "pendingBookings" INTEGER DEFAULT 0,
                "cancelledBookings" INTEGER DEFAULT 0,
                "lastCheckIn" DATE,
                "nextCheckIn" DATE,
                "totalSpent" DECIMAL(12,2) DEFAULT 0,
                "lastActivity" TIMESTAMP,
                "source" TEXT[] DEFAULT '{}',
                "status" VARCHAR(20) DEFAULT 'active',
                "createdAt" TIMESTAMP DEFAULT NOW(),
                "updatedAt" TIMESTAMP DEFAULT NOW(),
                "syncErrors" INTEGER DEFAULT 0
            )
        `;
        console.log('✅ Tabla creada');
        stepsCompleted++;
        
        // 2. CREAR ÍNDICES
        console.log('\n📊 [2/10] Creando índices...');
        
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_contactos_phone ON "Contactos"("phoneNumber")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_contactos_activity ON "Contactos"("lastActivity")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_contactos_status ON "Contactos"("status")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_contactos_whatsapp ON "Contactos"("hasWhatsapp")`;
        console.log('✅ Índices creados');
        stepsCompleted++;
        
        // 3. FUNCIÓN DE NORMALIZACIÓN
        console.log('\n📱 [3/10] Creando función normalize_phone...');
        
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
            RETURNS TEXT AS $$
            DECLARE
                normalized TEXT;
            BEGIN
                IF phone IS NULL THEN RETURN NULL; END IF;
                normalized := REGEXP_REPLACE(phone, '[^0-9+]', '', 'g');
                IF LEFT(normalized, 1) != '+' THEN
                    IF LEFT(normalized, 2) = '57' THEN
                        normalized := '+' || normalized;
                    ELSE
                        normalized := '+57' || normalized;
                    END IF;
                END IF;
                IF LENGTH(normalized) < 12 THEN RETURN NULL; END IF;
                RETURN normalized;
            END;
            $$ LANGUAGE plpgsql
        `;
        console.log('✅ Función creada');
        stepsCompleted++;
        
        // 4. FUNCIÓN MEJOR NOMBRE
        console.log('\n👤 [4/10] Creando función get_best_name...');
        
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION get_best_name(name1 TEXT, name2 TEXT)
            RETURNS TEXT AS $$
            BEGIN
                IF name1 IS NULL THEN RETURN name2; END IF;
                IF name2 IS NULL THEN RETURN name1; END IF;
                IF LENGTH(name1) >= LENGTH(name2) THEN
                    RETURN name1;
                ELSE
                    RETURN name2;
                END IF;
            END;
            $$ LANGUAGE plpgsql
        `;
        console.log('✅ Función creada');
        stepsCompleted++;
        
        // 5. FUNCIÓN SYNC BOOKING
        console.log('\n🔄 [5/10] Creando función sync_booking_to_contactos...');
        
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION sync_booking_to_contactos()
            RETURNS TRIGGER AS $$
            DECLARE
                v_normalized_phone TEXT;
            BEGIN
                v_normalized_phone := normalize_phone(NEW."clientPhone");
                IF v_normalized_phone IS NULL THEN
                    RAISE WARNING 'Teléfono inválido en Booking: %', NEW."clientPhone";
                    RETURN NEW;
                END IF;
                
                INSERT INTO "Contactos" (
                    "phoneNumber", "name", "email",
                    "totalBookings", "confirmedBookings", "pendingBookings", "cancelledBookings",
                    "lastCheckIn", "nextCheckIn", "totalSpent",
                    "source", "lastActivity", "status"
                )
                VALUES (
                    v_normalized_phone,
                    NEW."clientName",
                    NEW."clientEmail",
                    1,
                    CASE WHEN NEW."BDStatus" IN ('Confirmada', 'Futura Confirmada') THEN 1 ELSE 0 END,
                    CASE WHEN NEW."BDStatus" = 'Futura Pendiente' THEN 1 ELSE 0 END,
                    CASE WHEN NEW."BDStatus" = 'Cancelada' THEN 1 ELSE 0 END,
                    CASE WHEN NEW."checkIn" < CURRENT_DATE THEN NEW."checkIn" ELSE NULL END,
                    CASE WHEN NEW."checkIn" >= CURRENT_DATE THEN NEW."checkIn" ELSE NULL END,
                    COALESCE(NEW."totalAmount", 0),
                    ARRAY['booking'],
                    COALESCE(NEW."updatedAt", NEW."createdAt", NOW()),
                    'active'
                )
                ON CONFLICT ("phoneNumber") DO UPDATE SET
                    "name" = get_best_name("Contactos"."name", EXCLUDED."name"),
                    "email" = COALESCE("Contactos"."email", EXCLUDED."email"),
                    "totalBookings" = "Contactos"."totalBookings" + 1,
                    "confirmedBookings" = "Contactos"."confirmedBookings" + 
                        CASE WHEN NEW."BDStatus" IN ('Confirmada', 'Futura Confirmada') THEN 1 ELSE 0 END,
                    "pendingBookings" = "Contactos"."pendingBookings" + 
                        CASE WHEN NEW."BDStatus" = 'Futura Pendiente' THEN 1 ELSE 0 END,
                    "cancelledBookings" = "Contactos"."cancelledBookings" + 
                        CASE WHEN NEW."BDStatus" = 'Cancelada' THEN 1 ELSE 0 END,
                    "lastCheckIn" = CASE 
                        WHEN NEW."checkIn" < CURRENT_DATE THEN 
                            GREATEST("Contactos"."lastCheckIn", NEW."checkIn")
                        ELSE "Contactos"."lastCheckIn"
                    END,
                    "nextCheckIn" = CASE 
                        WHEN NEW."checkIn" >= CURRENT_DATE THEN
                            LEAST("Contactos"."nextCheckIn", NEW."checkIn")
                        ELSE "Contactos"."nextCheckIn"
                    END,
                    "totalSpent" = "Contactos"."totalSpent" + COALESCE(NEW."totalAmount", 0),
                    "source" = CASE 
                        WHEN 'booking' = ANY("Contactos"."source") 
                        THEN "Contactos"."source"
                        ELSE array_append("Contactos"."source", 'booking')
                    END,
                    "lastActivity" = GREATEST("Contactos"."lastActivity", COALESCE(NEW."updatedAt", NEW."createdAt", NOW())),
                    "updatedAt" = NOW();
                
                RETURN NEW;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING 'Error sincronizando Booking ID %: %', NEW."id", SQLERRM;
                    RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `;
        console.log('✅ Función creada');
        stepsCompleted++;
        
        // 6. TRIGGER BOOKING
        console.log('\n🔄 [6/10] Creando trigger para Booking...');
        
        await prisma.$executeRaw`DROP TRIGGER IF EXISTS trigger_booking_to_contactos ON "Booking"`;
        await prisma.$executeRaw`
            CREATE TRIGGER trigger_booking_to_contactos
            AFTER INSERT OR UPDATE ON "Booking"
            FOR EACH ROW
            EXECUTE FUNCTION sync_booking_to_contactos()
        `;
        console.log('✅ Trigger creado');
        stepsCompleted++;
        
        // 7. FUNCIÓN SYNC CLIENTVIEW
        console.log('\n🔄 [7/10] Creando función sync_clientview_to_contactos...');
        
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION sync_clientview_to_contactos()
            RETURNS TRIGGER AS $$
            DECLARE
                v_normalized_phone TEXT;
            BEGIN
                v_normalized_phone := normalize_phone(NEW."phoneNumber");
                IF v_normalized_phone IS NULL THEN
                    RAISE WARNING 'Teléfono inválido en ClientView: %', NEW."phoneNumber";
                    RETURN NEW;
                END IF;
                
                INSERT INTO "Contactos" (
                    "phoneNumber", "name",
                    "whatsappChatId", "whatsappLabels", "lastWhatsappMsg", "hasWhatsapp",
                    "source", "lastActivity", "status"
                )
                VALUES (
                    v_normalized_phone,
                    NEW."name",
                    NEW."chatId",
                    NEW."labels",
                    NEW."lastActivity",
                    true,
                    ARRAY['whatsapp'],
                    NEW."lastActivity",
                    'active'
                )
                ON CONFLICT ("phoneNumber") DO UPDATE SET
                    "name" = get_best_name("Contactos"."name", NEW."name"),
                    "whatsappChatId" = NEW."chatId",
                    "whatsappLabels" = NEW."labels",
                    "lastWhatsappMsg" = NEW."lastActivity",
                    "hasWhatsapp" = true,
                    "source" = CASE 
                        WHEN 'whatsapp' = ANY("Contactos"."source") 
                        THEN "Contactos"."source"
                        ELSE array_append("Contactos"."source", 'whatsapp')
                    END,
                    "lastActivity" = GREATEST("Contactos"."lastActivity", NEW."lastActivity"),
                    "status" = 'active',
                    "updatedAt" = NOW();
                
                RETURN NEW;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING 'Error sincronizando ClientView: %', SQLERRM;
                    RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `;
        console.log('✅ Función creada');
        stepsCompleted++;
        
        // 8. TRIGGER CLIENTVIEW
        console.log('\n🔄 [8/10] Creando trigger para ClientView...');
        
        await prisma.$executeRaw`DROP TRIGGER IF EXISTS trigger_clientview_to_contactos ON "ClientView"`;
        await prisma.$executeRaw`
            CREATE TRIGGER trigger_clientview_to_contactos
            AFTER INSERT OR UPDATE ON "ClientView"
            FOR EACH ROW
            EXECUTE FUNCTION sync_clientview_to_contactos()
        `;
        console.log('✅ Trigger creado');
        stepsCompleted++;
        
        // 9. FUNCIÓN UPDATE STATUS
        console.log('\n📊 [9/10] Creando función update_contact_status...');
        
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION update_contact_status()
            RETURNS TRIGGER AS $$
            BEGIN
                IF NEW."lastActivity" IS NULL OR 
                   NEW."lastActivity" < CURRENT_DATE - INTERVAL '365 days' THEN
                    NEW."status" = 'archived';
                ELSIF NEW."lastActivity" < CURRENT_DATE - INTERVAL '180 days' THEN
                    NEW."status" = 'inactive';
                ELSE
                    NEW."status" = 'active';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `;
        
        await prisma.$executeRaw`DROP TRIGGER IF EXISTS trigger_update_contact_status ON "Contactos"`;
        await prisma.$executeRaw`
            CREATE TRIGGER trigger_update_contact_status
            BEFORE INSERT OR UPDATE ON "Contactos"
            FOR EACH ROW
            EXECUTE FUNCTION update_contact_status()
        `;
        console.log('✅ Función y trigger creados');
        stepsCompleted++;
        
        // 10. TABLA DE LOGS
        console.log('\n📝 [10/10] Creando tabla de logs...');
        
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "ContactosSyncLog" (
                "id" SERIAL PRIMARY KEY,
                "timestamp" TIMESTAMP DEFAULT NOW(),
                "source" VARCHAR(50),
                "action" VARCHAR(50),
                "phoneNumber" VARCHAR(20),
                "success" BOOLEAN,
                "error" TEXT
            )
        `;
        console.log('✅ Tabla de logs creada');
        stepsCompleted++;
        
        // RESUMEN
        console.log('\n' + '=' .repeat(60));
        console.log(`✅ IMPLEMENTACIÓN COMPLETADA (${stepsCompleted}/10 pasos)`);
        console.log('\n📋 Componentes creados:');
        console.log('  ✓ Tabla Contactos con 4 índices');
        console.log('  ✓ Función normalize_phone()');
        console.log('  ✓ Función get_best_name()');
        console.log('  ✓ Trigger sync_booking_to_contactos()');
        console.log('  ✓ Trigger sync_clientview_to_contactos()');
        console.log('  ✓ Función update_contact_status()');
        console.log('  ✓ Tabla ContactosSyncLog');
        
        console.log('\n📌 Siguiente paso: Ejecutar migración inicial');
        console.log('   node scripts/migrate-initial-contactos.js');
        
    } catch (error) {
        console.error(`\n❌ Error en paso ${stepsCompleted + 1}:`, error.message);
        console.log(`\n⚠️ Completados ${stepsCompleted}/10 pasos`);
        
        // Registrar en log si la tabla existe
        try {
            await prisma.$executeRaw`
                INSERT INTO "ContactosSyncLog" ("source", "action", "success", "error")
                VALUES ('implementation', 'setup', false, ${error.message})
            `;
        } catch (e) {
            // Ignorar si la tabla de logs no existe
        }
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
implementContactosTable();