import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('🔄 Migrando de Booking + BookingWithStatus a una sola tabla Booking...');
        
        console.log('\n📊 Estado inicial:');
        const initialBookingCount = await prisma.booking.count();
        console.log(`- Tabla Booking: ${initialBookingCount} registros`);
        
        const viewCount = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "BookingWithStatus"`);
        console.log(`- VIEW BookingWithStatus: ${(viewCount as any)[0].count} registros`);
        
        // 1. Crear backup de datos desde la VIEW (que tiene BDStatus automático)
        console.log('\n💾 Creando backup de datos desde BookingWithStatus...');
        
        const backupData = await prisma.$queryRawUnsafe(`
            SELECT * FROM "BookingWithStatus"
        `);
        
        console.log(`✅ Backup creado: ${(backupData as any[]).length} registros`);
        
        // 2. Eliminar tabla Booking actual
        console.log('\n🗑️ Eliminando tabla Booking antigua...');
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Booking" CASCADE`);
        console.log('✅ Tabla Booking eliminada');
        
        // 3. Crear nueva tabla Booking con la estructura correcta
        console.log('\n🏗️ Creando nueva tabla Booking...');
        
        await prisma.$executeRawUnsafe(`
            CREATE TABLE "Booking" (
                id SERIAL PRIMARY KEY,
                "bookingId" VARCHAR UNIQUE NOT NULL,
                phone VARCHAR,
                "guestName" VARCHAR,
                status VARCHAR,
                "internalNotes" VARCHAR,
                "propertyName" VARCHAR,
                "arrivalDate" VARCHAR,
                "departureDate" VARCHAR,
                "numNights" INTEGER,
                "totalPersons" INTEGER,
                "totalCharges" VARCHAR,
                "totalPayments" VARCHAR,
                balance VARCHAR,
                "basePrice" VARCHAR,
                channel VARCHAR,
                email VARCHAR,
                "apiReference" VARCHAR,
                charges JSONB DEFAULT '[]',
                payments JSONB DEFAULT '[]',
                messages JSONB DEFAULT '[]',
                "infoItems" JSONB DEFAULT '[]',
                notes VARCHAR,
                "bookingDate" VARCHAR,
                "modifiedDate" VARCHAR,
                "lastUpdatedBD" TIMESTAMP DEFAULT NOW(),
                raw JSONB,
                "BDStatus" VARCHAR -- Ahora incluimos BDStatus como campo calculado
            )
        `);
        
        // 4. Crear índices
        console.log('📊 Creando índices...');
        const indices = [
            'CREATE INDEX "Booking_arrivalDate_idx" ON "Booking"("arrivalDate")',
            'CREATE INDEX "Booking_bookingId_idx" ON "Booking"("bookingId")',
            'CREATE INDEX "Booking_channel_idx" ON "Booking"(channel)',
            'CREATE INDEX "Booking_departureDate_idx" ON "Booking"("departureDate")',
            'CREATE INDEX "Booking_guestName_idx" ON "Booking"("guestName")',
            'CREATE INDEX "Booking_modifiedDate_idx" ON "Booking"("modifiedDate")',
            'CREATE INDEX "Booking_phone_idx" ON "Booking"(phone)',
            'CREATE INDEX "Booking_propertyName_departureDate_idx" ON "Booking"("propertyName", "departureDate")',
            'CREATE INDEX "Booking_status_idx" ON "Booking"(status)',
            'CREATE INDEX "Booking_BDStatus_idx" ON "Booking"("BDStatus")' // Nuevo índice para BDStatus
        ];
        
        for (const index of indices) {
            await prisma.$executeRawUnsafe(index);
        }
        
        console.log('✅ Índices creados');
        
        // 5. Insertar datos desde backup (que incluye BDStatus calculado)
        console.log('\n📥 Insertando datos con BDStatus automático...');
        
        // Insertar en lotes para evitar memoria excesiva
        const batchSize = 100;
        const data = backupData as any[];
        
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            
            const values = batch.map(row => {
                // Escapar valores para SQL
                const escapeValue = (val: any) => {
                    if (val === null || val === undefined) return 'NULL';
                    if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                    return val;
                };
                
                return `(
                    ${escapeValue(row.bookingId)},
                    ${escapeValue(row.phone)},
                    ${escapeValue(row.guestName)},
                    ${escapeValue(row.status)},
                    ${escapeValue(row.internalNotes)},
                    ${escapeValue(row.propertyName)},
                    ${escapeValue(row.arrivalDate)},
                    ${escapeValue(row.departureDate)},
                    ${row.numNights || 'NULL'},
                    ${row.totalPersons || 'NULL'},
                    ${escapeValue(row.totalCharges)},
                    ${escapeValue(row.totalPayments)},
                    ${escapeValue(row.balance)},
                    ${escapeValue(row.basePrice)},
                    ${escapeValue(row.channel)},
                    ${escapeValue(row.email)},
                    ${escapeValue(row.apiReference)},
                    ${escapeValue(row.charges)},
                    ${escapeValue(row.payments)},
                    ${escapeValue(row.messages)},
                    ${escapeValue(row.infoItems)},
                    ${escapeValue(row.notes)},
                    ${escapeValue(row.bookingDate)},
                    ${escapeValue(row.modifiedDate)},
                    NOW(),
                    ${escapeValue(row.raw)},
                    ${escapeValue(row.BDStatus)}
                )`;
            }).join(',');
            
            await prisma.$executeRawUnsafe(`
                INSERT INTO "Booking" (
                    "bookingId", phone, "guestName", status, "internalNotes", 
                    "propertyName", "arrivalDate", "departureDate", "numNights", 
                    "totalPersons", "totalCharges", "totalPayments", balance, 
                    "basePrice", channel, email, "apiReference", charges, 
                    payments, messages, "infoItems", notes, "bookingDate", 
                    "modifiedDate", "lastUpdatedBD", raw, "BDStatus"
                ) VALUES ${values}
            `);
            
            console.log(`✅ Lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(data.length/batchSize)} insertado`);
        }
        
        // 6. Eliminar VIEW BookingWithStatus
        console.log('\n🗑️ Eliminando VIEW BookingWithStatus...');
        await prisma.$executeRawUnsafe(`DROP VIEW IF EXISTS "BookingWithStatus"`);
        console.log('✅ VIEW eliminada');
        
        // 7. Verificar resultado
        const finalCount = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "Booking"`);
        const statusStats = await prisma.$queryRawUnsafe(`
            SELECT "BDStatus", COUNT(*) as count 
            FROM "Booking" 
            WHERE "BDStatus" IS NOT NULL 
            GROUP BY "BDStatus" 
            ORDER BY count DESC
        `);
        
        console.log('\n✅ Migración completada:');
        console.log(`- Nueva tabla Booking: ${(finalCount as any)[0].count} registros`);
        console.log('\n📊 Estadísticas de BDStatus:');
        (statusStats as any[]).forEach(stat => {
            console.log(`- ${stat.BDStatus}: ${stat.count} reservas`);
        });
        
        console.log('\n🎉 ¡Migración exitosa!');
        console.log('✅ Ahora tienes una sola tabla Booking con BDStatus automático');
        
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);