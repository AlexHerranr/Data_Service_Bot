/**
 * Script para implementar la tabla maestra CONTACTOS
 * Incluye creación de tabla, funciones de normalización, triggers y migración inicial
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function implementContactosTable() {
    console.log('🚀 IMPLEMENTACIÓN DE TABLA CONTACTOS');
    console.log('=' .repeat(60));
    
    try {
        // 1. CREAR TABLA CONTACTOS
        console.log('\n📊 Creando tabla Contactos...');
        
        await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "Contactos" (
                "id" SERIAL PRIMARY KEY,
                "phoneNumber" VARCHAR(20) UNIQUE NOT NULL,
                
                -- Información básica
                "name" VARCHAR(255),
                "email" VARCHAR(255),
                
                -- Datos de WhatsApp
                "whatsappChatId" VARCHAR(100) UNIQUE,
                "whatsappLabels" TEXT,
                "lastWhatsappMsg" TIMESTAMP,
                "hasWhatsapp" BOOLEAN DEFAULT false,
                
                -- Contadores de reservas
                "totalBookings" INTEGER DEFAULT 0,
                "confirmedBookings" INTEGER DEFAULT 0,
                "pendingBookings" INTEGER DEFAULT 0,
                "cancelledBookings" INTEGER DEFAULT 0,
                
                -- Datos de reservas
                "lastCheckIn" DATE,
                "nextCheckIn" DATE,
                "totalSpent" DECIMAL(12,2) DEFAULT 0,
                
                -- Consolidado
                "lastActivity" TIMESTAMP,
                "source" TEXT[] DEFAULT '{}',
                "status" VARCHAR(20) DEFAULT 'active',
                
                -- Metadata
                "createdAt" TIMESTAMP DEFAULT NOW(),
                "updatedAt" TIMESTAMP DEFAULT NOW(),
                "syncErrors" INTEGER DEFAULT 0
            )
        `;
        
        // Crear índices
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_contactos_phone ON "Contactos"("phoneNumber")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_contactos_activity ON "Contactos"("lastActivity")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_contactos_status ON "Contactos"("status")`;
        await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_contactos_whatsapp ON "Contactos"("hasWhatsapp")`;
        
        console.log('✅ Tabla Contactos creada con índices');
        
        // 2. CREAR FUNCIÓN DE NORMALIZACIÓN DE TELÉFONOS
        console.log('\n📱 Creando función de normalización de teléfonos...');
        
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
            RETURNS TEXT AS $$
            DECLARE
                normalized TEXT;
            BEGIN
                -- Eliminar espacios, guiones, paréntesis
                normalized := REGEXP_REPLACE(phone, '[^0-9+]', '', 'g');
                
                -- Si no empieza con +, agregar código de Colombia
                IF LEFT(normalized, 1) != '+' THEN
                    IF LEFT(normalized, 2) = '57' THEN
                        normalized := '+' || normalized;
                    ELSE
                        normalized := '+57' || normalized;
                    END IF;
                END IF;
                
                -- Validar longitud mínima (10 dígitos + código país)
                IF LENGTH(normalized) < 12 THEN
                    RETURN NULL;
                END IF;
                
                RETURN normalized;
            END;
            $$ LANGUAGE plpgsql;
        `;
        
        console.log('✅ Función de normalización creada');
        
        // 3. CREAR FUNCIÓN PARA DETERMINAR MEJOR NOMBRE
        console.log('\n👤 Creando función para seleccionar mejor nombre...');
        
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION get_best_name(name1 TEXT, name2 TEXT)
            RETURNS TEXT AS $$
            BEGIN
                -- Si uno es NULL, retornar el otro
                IF name1 IS NULL THEN RETURN name2; END IF;
                IF name2 IS NULL THEN RETURN name1; END IF;
                
                -- Retornar el más largo (más completo)
                IF LENGTH(name1) >= LENGTH(name2) THEN
                    RETURN name1;
                ELSE
                    RETURN name2;
                END IF;
            END;
            $$ LANGUAGE plpgsql;
        `;
        
        console.log('✅ Función de mejor nombre creada');
        
        // 4. CREAR TRIGGER DESDE BOOKING
        console.log('\n🔄 Creando trigger desde Booking...');
        
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION sync_booking_to_contactos()
            RETURNS TRIGGER AS $$
            DECLARE
                v_normalized_phone TEXT;
                v_status_counts RECORD;
            BEGIN
                -- Normalizar teléfono
                v_normalized_phone := normalize_phone(NEW."clientPhone");
                
                -- Si el teléfono no es válido, registrar error y salir
                IF v_normalized_phone IS NULL THEN
                    RAISE WARNING 'Teléfono inválido en Booking: %', NEW."clientPhone";
                    RETURN NEW;
                END IF;
                
                -- Insertar o actualizar en Contactos
                INSERT INTO "Contactos" (
                    "phoneNumber",
                    "name",
                    "email",
                    "totalBookings",
                    "confirmedBookings",
                    "pendingBookings",
                    "cancelledBookings",
                    "lastCheckIn",
                    "nextCheckIn",
                    "totalSpent",
                    "source",
                    "lastActivity",
                    "status"
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
                    
                    -- Actualizar contadores
                    "totalBookings" = "Contactos"."totalBookings" + 1,
                    "confirmedBookings" = "Contactos"."confirmedBookings" + 
                        CASE WHEN NEW."BDStatus" IN ('Confirmada', 'Futura Confirmada') THEN 1 ELSE 0 END,
                    "pendingBookings" = "Contactos"."pendingBookings" + 
                        CASE WHEN NEW."BDStatus" = 'Futura Pendiente' THEN 1 ELSE 0 END,
                    "cancelledBookings" = "Contactos"."cancelledBookings" + 
                        CASE WHEN NEW."BDStatus" = 'Cancelada' THEN 1 ELSE 0 END,
                    
                    -- Actualizar fechas
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
                    
                    -- Actualizar total gastado
                    "totalSpent" = "Contactos"."totalSpent" + COALESCE(NEW."totalAmount", 0),
                    
                    -- Actualizar source si no existe
                    "source" = CASE 
                        WHEN 'booking' = ANY("Contactos"."source") 
                        THEN "Contactos"."source"
                        ELSE array_append("Contactos"."source", 'booking')
                    END,
                    
                    -- Actualizar última actividad
                    "lastActivity" = GREATEST("Contactos"."lastActivity", COALESCE(NEW."updatedAt", NEW."createdAt", NOW())),
                    
                    -- Actualizar timestamp
                    "updatedAt" = NOW();
                
                RETURN NEW;
            EXCEPTION
                WHEN OTHERS THEN
                    -- Registrar error
                    UPDATE "Contactos" 
                    SET "syncErrors" = "syncErrors" + 1
                    WHERE "phoneNumber" = v_normalized_phone;
                    
                    RAISE WARNING 'Error sincronizando Booking ID %: %', NEW."id", SQLERRM;
                    RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `;
        
        // Crear el trigger
        await prisma.$executeRaw`
            DROP TRIGGER IF EXISTS trigger_booking_to_contactos ON "Booking";
            
            CREATE TRIGGER trigger_booking_to_contactos
            AFTER INSERT OR UPDATE ON "Booking"
            FOR EACH ROW
            EXECUTE FUNCTION sync_booking_to_contactos();
        `;
        
        console.log('✅ Trigger desde Booking creado');
        
        // 5. CREAR TRIGGER DESDE CLIENTVIEW
        console.log('\n🔄 Creando trigger desde ClientView...');
        
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION sync_clientview_to_contactos()
            RETURNS TRIGGER AS $$
            DECLARE
                v_normalized_phone TEXT;
            BEGIN
                -- Normalizar teléfono
                v_normalized_phone := normalize_phone(NEW."phoneNumber");
                
                IF v_normalized_phone IS NULL THEN
                    RAISE WARNING 'Teléfono inválido en ClientView: %', NEW."phoneNumber";
                    RETURN NEW;
                END IF;
                
                -- Insertar o actualizar en Contactos
                INSERT INTO "Contactos" (
                    "phoneNumber",
                    "name",
                    "whatsappChatId",
                    "whatsappLabels",
                    "lastWhatsappMsg",
                    "hasWhatsapp",
                    "source",
                    "lastActivity",
                    "status"
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
                    
                    -- Actualizar source
                    "source" = CASE 
                        WHEN 'whatsapp' = ANY("Contactos"."source") 
                        THEN "Contactos"."source"
                        ELSE array_append("Contactos"."source", 'whatsapp')
                    END,
                    
                    -- Actualizar actividad
                    "lastActivity" = GREATEST("Contactos"."lastActivity", NEW."lastActivity"),
                    "status" = 'active',
                    "updatedAt" = NOW();
                
                RETURN NEW;
            EXCEPTION
                WHEN OTHERS THEN
                    UPDATE "Contactos" 
                    SET "syncErrors" = "syncErrors" + 1
                    WHERE "phoneNumber" = v_normalized_phone;
                    
                    RAISE WARNING 'Error sincronizando ClientView: %', SQLERRM;
                    RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `;
        
        // Crear el trigger
        await prisma.$executeRaw`
            DROP TRIGGER IF EXISTS trigger_clientview_to_contactos ON "ClientView";
            
            CREATE TRIGGER trigger_clientview_to_contactos
            AFTER INSERT OR UPDATE ON "ClientView"
            FOR EACH ROW
            EXECUTE FUNCTION sync_clientview_to_contactos();
        `;
        
        console.log('✅ Trigger desde ClientView creado');
        
        // 6. CREAR FUNCIÓN PARA ACTUALIZAR STATUS
        console.log('\n📊 Creando función para actualizar status automáticamente...');
        
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION update_contact_status()
            RETURNS TRIGGER AS $$
            BEGIN
                -- Determinar status basado en actividad
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
            $$ LANGUAGE plpgsql;
        `;
        
        // Trigger para actualizar status
        await prisma.$executeRaw`
            CREATE TRIGGER trigger_update_contact_status
            BEFORE INSERT OR UPDATE ON "Contactos"
            FOR EACH ROW
            EXECUTE FUNCTION update_contact_status();
        `;
        
        console.log('✅ Función de status automático creada');
        
        // 7. CREAR TABLA DE LOGS PARA DEBUGGING
        console.log('\n📝 Creando tabla de logs...');
        
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
        
        // 8. ESTADÍSTICAS
        console.log('\n' + '=' .repeat(60));
        console.log('✅ IMPLEMENTACIÓN COMPLETADA');
        console.log('\nComponentes creados:');
        console.log('  • Tabla Contactos con índices');
        console.log('  • Función normalize_phone()');
        console.log('  • Función get_best_name()');
        console.log('  • Trigger sync_booking_to_contactos()');
        console.log('  • Trigger sync_clientview_to_contactos()');
        console.log('  • Función update_contact_status()');
        console.log('  • Tabla ContactosSyncLog para debugging');
        
        console.log('\n📌 Siguiente paso: Ejecutar migración inicial de datos');
        
    } catch (error) {
        console.error('❌ Error en implementación:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
implementContactosTable();