/**
 * Script simplificado para crear tabla IA_CRM_Clientes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createIACRM() {
    console.log('🚀 CREANDO TABLA IA_CRM_Clientes');
    console.log('=' .repeat(80));
    
    try {
        // 1. Eliminar tabla si existe
        console.log('\n🗑️ Eliminando tabla anterior si existe...');
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "IA_CRM_Clientes" CASCADE`);
        console.log('✅ Limpieza completada');
        
        // 2. Crear tabla nueva
        console.log('\n🔨 Creando tabla nueva...');
        await prisma.$executeRawUnsafe(`
            CREATE TABLE "IA_CRM_Clientes" (
                "id" SERIAL PRIMARY KEY,
                "phoneNumber" VARCHAR(50) UNIQUE NOT NULL,
                "clientName" VARCHAR(255),
                "email" VARCHAR(255),
                "bookingId" VARCHAR(255),
                "currentStatus" VARCHAR(50),
                "source" VARCHAR(50),
                "profileStatus" TEXT,
                "proximaAccion" VARCHAR(255),
                "fechaProximaAccion" TIMESTAMP,
                "prioridad" INTEGER DEFAULT 3 CHECK (prioridad BETWEEN 1 AND 5),
                "propertyName" VARCHAR(255),
                "arrivalDate" DATE,
                "departureDate" DATE,
                "lastInteraction" TIMESTAMP,
                "lastWhatsappMessage" TEXT,
                "threadId" VARCHAR(255),
                "totalBookings" INTEGER DEFAULT 0,
                "totalValue" DECIMAL(10,2) DEFAULT 0,
                "tags" TEXT[],
                "automationEnabled" BOOLEAN DEFAULT true,
                "notes" TEXT,
                "createdAt" TIMESTAMP DEFAULT NOW(),
                "updatedAt" TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Tabla creada');
        
        // 3. Crear índices
        console.log('\n📑 Creando índices...');
        await prisma.$executeRawUnsafe(`CREATE INDEX idx_ia_crm_phone ON "IA_CRM_Clientes" ("phoneNumber")`);
        await prisma.$executeRawUnsafe(`CREATE INDEX idx_ia_crm_proxima ON "IA_CRM_Clientes" ("fechaProximaAccion", "prioridad")`);
        await prisma.$executeRawUnsafe(`CREATE INDEX idx_ia_crm_status ON "IA_CRM_Clientes" ("currentStatus")`);
        await prisma.$executeRawUnsafe(`CREATE INDEX idx_ia_crm_booking ON "IA_CRM_Clientes" ("bookingId")`);
        console.log('✅ Índices creados');
        
        // 4. Sincronizar desde Booking (solo reservas NO canceladas)
        console.log('\n📥 Sincronizando desde Booking...');
        const bookingInsert = await prisma.$executeRawUnsafe(`
            INSERT INTO "IA_CRM_Clientes" (
                "phoneNumber",
                "clientName",
                "email",
                "bookingId",
                "currentStatus",
                "source",
                "propertyName",
                "arrivalDate",
                "departureDate",
                "totalBookings",
                "totalValue"
            )
            SELECT DISTINCT ON (b."phone")
                COALESCE(b."phone", 'unknown-' || b."bookingId"),
                b."guestName",
                b."email",
                b."bookingId",
                CASE 
                    WHEN b."BDStatus" = 'Futura Pendiente' THEN 'lead'
                    WHEN b."BDStatus" = 'Futura Confirmada' THEN 'confirmado'
                    WHEN b."BDStatus" IN ('Pasada Confirmada', 'Pasada Pendiente') THEN 'completado'
                    WHEN b."BDStatus" LIKE '%Cancelada%' THEN 'cancelado'
                    WHEN b."arrivalDate"::date = CURRENT_DATE THEN 'hospedado'
                    ELSE 'prospecto'
                END,
                COALESCE(b."channel", 'direct'),
                b."propertyName",
                b."arrivalDate"::date,
                b."departureDate"::date,
                (SELECT COUNT(*) FROM "Booking" WHERE "phone" = b."phone" AND "BDStatus" NOT LIKE '%Cancelada%'),
                (SELECT COALESCE(SUM(CAST(NULLIF("totalCharges", '') AS DECIMAL)), 0) 
                 FROM "Booking" WHERE "phone" = b."phone" AND "BDStatus" NOT LIKE '%Cancelada%')
            FROM "Booking" b
            WHERE b."phone" IS NOT NULL 
              AND b."phone" != ''
              AND b."phone" != 'unknown'
              AND b."BDStatus" NOT LIKE '%Cancelada%'
            ORDER BY b."phone", b."lastUpdatedBD" DESC
            ON CONFLICT ("phoneNumber") DO NOTHING
        `);
        console.log(`✅ Sincronizados ${bookingInsert.count} registros desde Booking`);
        
        // 5. Sincronizar desde ClientView (solo los que NO tienen reserva activa)
        console.log('\n📥 Sincronizando desde ClientView (WhatsApp)...');
        const whatsappInsert = await prisma.$executeRawUnsafe(`
            INSERT INTO "IA_CRM_Clientes" (
                "phoneNumber",
                "clientName",
                "currentStatus",
                "source",
                "threadId",
                "profileStatus",
                "proximaAccion",
                "fechaProximaAccion",
                "prioridad",
                "lastInteraction"
            )
            SELECT 
                cv."phoneNumber",
                COALESCE(cv."name", cv."userName", 'Cliente WhatsApp'),
                'prospecto',
                'whatsapp',
                cv."threadId",
                cv."profileStatus",
                cv."proximaAccion",
                cv."fechaProximaAccion",
                COALESCE(cv."prioridad", 3),
                cv."lastActivity"
            FROM "ClientView" cv
            WHERE NOT EXISTS (
                SELECT 1 FROM "Booking" b 
                WHERE b."phone" = cv."phoneNumber" 
                AND b."BDStatus" NOT LIKE '%Cancelada%'
            )
            ON CONFLICT ("phoneNumber") DO NOTHING
        `);
        console.log(`✅ Sincronizados ${whatsappInsert.count} registros desde WhatsApp`);
        
        // 6. Verificación
        console.log('\n📊 VERIFICACIÓN:');
        
        const total = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "IA_CRM_Clientes"`;
        console.log(`\n✅ Total registros en CRM: ${total[0].count}`);
        
        // Estadísticas por status
        const stats = await prisma.$queryRaw`
            SELECT 
                COALESCE("currentStatus", 'sin_status') as "Estado",
                COUNT(*) as "Total",
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "IA_CRM_Clientes"), 1) || '%' as "Porcentaje"
            FROM "IA_CRM_Clientes"
            GROUP BY "currentStatus"
            ORDER BY COUNT(*) DESC
        `;
        
        console.log('\n📊 Distribución por Estado:');
        console.table(stats);
        
        // Estadísticas por fuente
        const sources = await prisma.$queryRaw`
            SELECT 
                COALESCE("source", 'sin_fuente') as "Fuente",
                COUNT(*) as "Total"
            FROM "IA_CRM_Clientes"
            GROUP BY "source"
            ORDER BY COUNT(*) DESC
        `;
        
        console.log('\n📊 Distribución por Fuente:');
        console.table(sources);
        
        // Muestra de datos
        const sample = await prisma.$queryRaw`
            SELECT 
                "clientName" as "Cliente",
                "phoneNumber" as "Teléfono",
                "currentStatus" as "Estado",
                "source" as "Fuente",
                TO_CHAR("arrivalDate", 'DD/MM/YYYY') as "Llegada",
                "totalBookings" as "Reservas"
            FROM "IA_CRM_Clientes"
            WHERE "currentStatus" IN ('lead', 'confirmado', 'hospedado')
            ORDER BY 
                CASE 
                    WHEN "currentStatus" = 'hospedado' THEN 1
                    WHEN "currentStatus" = 'lead' THEN 2
                    WHEN "currentStatus" = 'confirmado' THEN 3
                    ELSE 4
                END
            LIMIT 10
        `;
        
        if (sample.length > 0) {
            console.log('\n📋 Muestra de clientes activos:');
            console.table(sample);
        }
        
        console.log('\n' + '=' .repeat(80));
        console.log('🎉 ¡TABLA IA_CRM_Clientes CREADA EXITOSAMENTE!');
        console.log('=' .repeat(80));
        
        console.log('\n✅ Características implementadas:');
        console.log('• Unificación por número de teléfono');
        console.log('• No duplica clientes con reservas activas');
        console.log('• Sincronización desde Booking y WhatsApp');
        console.log('• 4 campos clave para IA');
        console.log('• Métricas de valor y frecuencia');
        
        console.log('\n🤖 La IA puede actualizar:');
        console.log('• profileStatus - Resumen del cliente');
        console.log('• proximaAccion - Siguiente paso');
        console.log('• fechaProximaAccion - Cuándo ejecutar');
        console.log('• prioridad - Urgencia (1-5)');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
createIACRM()
    .then(() => {
        console.log('\n✅ Proceso completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error fatal:', error.message);
        process.exit(1);
    });