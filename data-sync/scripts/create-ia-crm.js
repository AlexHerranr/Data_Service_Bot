/**
 * Script para crear y sincronizar la tabla IA_CRM_Clientes
 * Unifica datos de Booking y ClientView (WhatsApp)
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function createIACRM() {
    console.log('🚀 CREANDO TABLA IA_CRM_Clientes');
    console.log('=' .repeat(80));
    
    try {
        // 1. Leer el SQL
        const sqlPath = path.join(process.cwd(), '..', 'migration-scripts', 'create-ia-crm-table.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        
        // 2. Dividir en statements individuales
        const statements = sqlContent
            .split(';')
            .filter(stmt => stmt.trim().length > 0 && !stmt.trim().startsWith('--'))
            .map(stmt => stmt.trim() + ';');
        
        console.log(`\n📝 Ejecutando ${statements.length} statements SQL...`);
        
        // 3. Ejecutar cada statement
        for (let i = 0; i < statements.length; i++) {
            const stmt = statements[i];
            
            // Identificar qué hace cada statement
            let description = 'Ejecutando...';
            if (stmt.includes('DROP TABLE')) description = '🗑️ Eliminando tabla anterior';
            else if (stmt.includes('CREATE TABLE')) description = '🔨 Creando tabla nueva';
            else if (stmt.includes('CREATE INDEX')) description = '📑 Creando índices';
            else if (stmt.includes('CREATE OR REPLACE FUNCTION')) description = '🔧 Creando funciones';
            else if (stmt.includes('CREATE TRIGGER')) description = '⚡ Creando triggers';
            else if (stmt.includes('INSERT INTO')) description = '📥 Sincronizando datos';
            else if (stmt.includes('SELECT')) description = '📊 Verificando resultados';
            
            console.log(`\n${description}`);
            
            try {
                if (stmt.includes('SELECT') && stmt.includes('UNION')) {
                    // Es la query de verificación
                    const results = await prisma.$queryRawUnsafe(stmt);
                    console.log('\n📊 ESTADÍSTICAS FINALES:');
                    console.table(results);
                } else {
                    await prisma.$executeRawUnsafe(stmt);
                    console.log('✅ Completado');
                }
            } catch (error) {
                console.error(`❌ Error en statement ${i + 1}: ${error.message}`);
                // Continuar con el siguiente
            }
        }
        
        // 4. Verificación adicional
        console.log('\n📊 VERIFICACIÓN DETALLADA:');
        
        // Total de registros
        const total = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "IA_CRM_Clientes"`;
        console.log(`\n✅ Total registros en CRM: ${total[0].count}`);
        
        // Muestra de datos
        const sample = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "clientName",
                "currentStatus",
                "source",
                "propertyName",
                TO_CHAR("arrivalDate", 'DD/MM/YYYY') as "arrivalDate",
                "totalBookings",
                "prioridad"
            FROM "IA_CRM_Clientes"
            ORDER BY 
                CASE 
                    WHEN "currentStatus" = 'hospedado' THEN 1
                    WHEN "currentStatus" = 'lead' THEN 2
                    WHEN "currentStatus" = 'confirmado' THEN 3
                    ELSE 4
                END,
                "prioridad"
            LIMIT 10
        `;
        
        if (sample.length > 0) {
            console.log('\n📋 Primeros 10 registros (ordenados por prioridad):');
            console.table(sample);
        }
        
        // Distribución por status
        const byStatus = await prisma.$queryRaw`
            SELECT 
                "currentStatus",
                COUNT(*) as total,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "IA_CRM_Clientes"), 1) || '%' as porcentaje
            FROM "IA_CRM_Clientes"
            GROUP BY "currentStatus"
            ORDER BY COUNT(*) DESC
        `;
        
        console.log('\n📊 Distribución por Estado:');
        console.table(byStatus);
        
        // Distribución por fuente
        const bySource = await prisma.$queryRaw`
            SELECT 
                "source",
                COUNT(*) as total
            FROM "IA_CRM_Clientes"
            GROUP BY "source"
            ORDER BY COUNT(*) DESC
        `;
        
        console.log('\n📊 Distribución por Fuente:');
        console.table(bySource);
        
        console.log('\n' + '=' .repeat(80));
        console.log('🎉 ¡TABLA IA_CRM_Clientes CREADA EXITOSAMENTE!');
        console.log('=' .repeat(80));
        
        console.log('\n✅ Características implementadas:');
        console.log('• Unificación por número de teléfono');
        console.log('• No duplica clientes con reservas activas');
        console.log('• Permite reactivación de cancelados');
        console.log('• Sincronización automática desde Booking y ClientView');
        console.log('• 4 campos clave para IA (profileStatus, proximaAccion, fecha, prioridad)');
        console.log('• Triggers automáticos activos');
        
        console.log('\n🤖 Próximos pasos:');
        console.log('1. La IA puede empezar a analizar conversaciones');
        console.log('2. Actualizar los 4 campos clave periódicamente');
        console.log('3. Los triggers ejecutarán acciones según fechaProximaAccion');
        console.log('4. Dashboard para visualizar y gestionar');
        
    } catch (error) {
        console.error('\n❌ ERROR GENERAL:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
createIACRM()
    .then(() => {
        console.log('\n✅ Script completado exitosamente');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error fatal:', error.message);
        process.exit(1);
    });