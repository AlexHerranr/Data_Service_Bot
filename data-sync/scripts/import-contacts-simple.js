/**
 * Script SIMPLE para importar contactos desde CSV básico
 * Formato esperado: name,phone,email (o similar)
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import readline from 'readline';

const prisma = new PrismaClient();

async function importSimpleCSV(csvFilePath) {
    console.log('📱 IMPORTACIÓN SIMPLE DE CONTACTOS CSV');
    console.log('=' .repeat(60));
    
    if (!fs.existsSync(csvFilePath)) {
        console.error('❌ No se encuentra el archivo:', csvFilePath);
        return;
    }
    
    const fileStream = fs.createReadStream(csvFilePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    let lineNumber = 0;
    let imported = 0;
    let skipped = 0;
    let headers = [];
    
    console.log('\n🔄 Procesando archivo...\n');
    
    try {
        for await (const line of rl) {
            lineNumber++;
            
            // Primera línea = headers
            if (lineNumber === 1) {
                headers = line.toLowerCase().split(',').map(h => h.trim());
                console.log('📋 Columnas detectadas:', headers.join(', '));
                
                // Buscar índices de columnas
                const nameIndex = headers.findIndex(h => 
                    h.includes('name') || h.includes('nombre'));
                const phoneIndex = headers.findIndex(h => 
                    h.includes('phone') || h.includes('tel') || h.includes('móvil') || h.includes('celular'));
                const emailIndex = headers.findIndex(h => 
                    h.includes('email') || h.includes('correo'));
                
                if (phoneIndex === -1) {
                    console.error('❌ No se encontró columna de teléfono');
                    return;
                }
                
                console.log(`\n✅ Columnas mapeadas:`);
                console.log(`  • Nombre: columna ${nameIndex + 1}`);
                console.log(`  • Teléfono: columna ${phoneIndex + 1}`);
                console.log(`  • Email: columna ${emailIndex + 1}`);
                console.log('\n');
                
                continue;
            }
            
            // Procesar datos
            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            
            // Mapear según headers detectados
            const nameIndex = headers.findIndex(h => 
                h.includes('name') || h.includes('nombre'));
            const phoneIndex = headers.findIndex(h => 
                h.includes('phone') || h.includes('tel') || h.includes('móvil') || h.includes('celular'));
            const emailIndex = headers.findIndex(h => 
                h.includes('email') || h.includes('correo'));
            
            const name = nameIndex >= 0 ? values[nameIndex] : null;
            const phone = values[phoneIndex];
            const email = emailIndex >= 0 ? values[emailIndex] : null;
            
            if (!phone || phone === '') {
                skipped++;
                continue;
            }
            
            try {
                // Normalizar teléfono
                const result = await prisma.$queryRaw`
                    SELECT normalize_phone(${phone}) as normalized
                `;
                
                const normalizedPhone = result[0]?.normalized;
                
                if (!normalizedPhone) {
                    skipped++;
                    console.log(`⏭️ Línea ${lineNumber}: teléfono inválido (${phone})`);
                    continue;
                }
                
                // Insertar o actualizar
                await prisma.$executeRaw`
                    INSERT INTO "Contactos" (
                        "phoneNumber",
                        "name",
                        "email",
                        "source",
                        "lastActivity",
                        "status"
                    ) VALUES (
                        ${normalizedPhone},
                        ${name || null},
                        ${email || null},
                        ARRAY['csv_import'],
                        NOW(),
                        'active'
                    )
                    ON CONFLICT ("phoneNumber") DO UPDATE SET
                        "name" = COALESCE("Contactos"."name", EXCLUDED."name"),
                        "email" = COALESCE("Contactos"."email", EXCLUDED."email"),
                        "source" = CASE 
                            WHEN 'csv_import' = ANY("Contactos"."source") 
                            THEN "Contactos"."source"
                            ELSE array_append("Contactos"."source", 'csv_import')
                        END,
                        "updatedAt" = NOW()
                `;
                
                imported++;
                
                if (imported % 10 === 0) {
                    process.stdout.write(`\r✅ Importados: ${imported} | ⏭️ Saltados: ${skipped}`);
                }
                
            } catch (error) {
                console.error(`\n❌ Error en línea ${lineNumber}:`, error.message);
            }
        }
        
        console.log('\n\n' + '=' .repeat(60));
        console.log('📊 RESUMEN:');
        console.log(`  • Líneas procesadas: ${lineNumber - 1}`);
        console.log(`  • Contactos importados: ${imported}`);
        console.log(`  • Saltados: ${skipped}`);
        
        // Verificar total
        const total = await prisma.$queryRaw`
            SELECT COUNT(*) as total FROM "Contactos"
        `;
        
        console.log(`  • Total en base de datos: ${total[0].total}`);
        console.log('\n✅ Importación completada');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar
const csvPath = process.argv[2];

if (!csvPath) {
    console.log('📌 USO: node import-contacts-simple.js archivo.csv');
    console.log('\n📋 Formato CSV esperado:');
    console.log('  Primera línea: name,phone,email (o similar)');
    console.log('  Siguientes líneas: Juan Pérez,3123456789,juan@email.com');
    console.log('\n💡 El script detecta automáticamente las columnas por nombre');
} else {
    importSimpleCSV(csvPath);
}