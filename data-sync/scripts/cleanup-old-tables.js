/**
 * Script para eliminar tablas viejas y backups
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupOldTables() {
    console.log('🧹 LIMPIEZA DE TABLAS VIEJAS');
    console.log('=' .repeat(60));
    
    try {
        // 1. Verificar qué tablas existen
        console.log('\n📋 Buscando tablas para eliminar...');
        
        const tables = await prisma.$queryRaw`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND (
                table_name = 'IA_CMR_Clientes'
                OR table_name LIKE '%backup%'
                OR table_name LIKE '%_old'
                OR table_name LIKE '%_backup'
            )
            ORDER BY table_name
        `;
        
        if (tables.length > 0) {
            console.log('\n📦 Tablas encontradas para eliminar:');
            console.table(tables);
            
            // 2. Eliminar cada tabla
            for (const table of tables) {
                const tableName = table.table_name;
                console.log(`\n🗑️ Eliminando tabla: ${tableName}...`);
                
                try {
                    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
                    console.log(`✅ Tabla ${tableName} eliminada`);
                } catch (error) {
                    console.log(`⚠️ Error eliminando ${tableName}: ${error.message}`);
                }
            }
        } else {
            console.log('✅ No se encontraron tablas viejas o backups');
        }
        
        // 3. Eliminar específicamente las tablas mencionadas
        console.log('\n🗑️ Eliminando tablas específicas...');
        
        const specificTables = [
            'IA_CMR_Clientes',  // Tabla vieja con guión bajo
            'Leads_old',        // Backup de Leads
            'Leads_backup'      // Otro posible backup
        ];
        
        for (const tableName of specificTables) {
            try {
                const result = await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
                console.log(`✅ Verificado: ${tableName}`);
            } catch (error) {
                console.log(`⚠️ ${tableName}: ${error.message}`);
            }
        }
        
        // 4. Verificar tablas actuales
        console.log('\n📊 TABLAS ACTUALES EN LA BASE DE DATOS:');
        
        const currentTables = await prisma.$queryRaw`
            SELECT 
                table_name as "Tabla",
                CASE 
                    WHEN table_name IN ('Booking', 'Leads', 'ClientView', 'IA_CRM_Clientes', 'hotel_apartments') 
                    THEN '✅ Activa'
                    ELSE '⚠️ Revisar'
                END as "Estado"
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY 
                CASE 
                    WHEN table_name IN ('Booking', 'Leads', 'ClientView', 'IA_CRM_Clientes') THEN 0
                    ELSE 1
                END,
                table_name
        `;
        
        console.table(currentTables);
        
        // 5. Resumen de espacio liberado
        console.log('\n💾 ESPACIO EN BASE DE DATOS:');
        
        const dbSize = await prisma.$queryRaw`
            SELECT 
                pg_database.datname as "Base de Datos",
                pg_size_pretty(pg_database_size(pg_database.datname)) as "Tamaño Total"
            FROM pg_database
            WHERE datname = current_database()
        `;
        
        console.table(dbSize);
        
        // Tamaño de tablas principales
        const tableSizes = await prisma.$queryRaw`
            SELECT 
                tablename as "Tabla",
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as "Tamaño"
            FROM pg_tables
            WHERE schemaname = 'public'
            AND tablename IN ('Booking', 'Leads', 'ClientView', 'IA_CRM_Clientes', 'hotel_apartments')
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        `;
        
        console.log('\n📊 Tamaño de tablas principales:');
        console.table(tableSizes);
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎉 ¡LIMPIEZA COMPLETADA!');
        console.log('=' .repeat(60));
        
        console.log('\n✅ Tablas actuales del sistema:');
        console.log('• Booking - Reservas principales');
        console.log('• Leads - Reservas pendientes de pago');
        console.log('• ClientView - Clientes de WhatsApp');
        console.log('• IA_CRM_Clientes - CRM unificado (nueva)');
        console.log('• hotel_apartments - Configuración de propiedades');
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
cleanupOldTables()
    .then(() => {
        console.log('\n✅ Proceso completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });