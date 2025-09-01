/**
 * Script para importar contactos desde CSV de Google Contacts
 * Formato típico de Google: Name, Given Name, Family Name, Phone 1 - Value, Email 1 - Value, etc.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';

const prisma = new PrismaClient();

async function importGoogleContacts(csvFilePath) {
    console.log('📱 IMPORTACIÓN DE CONTACTOS DESDE GOOGLE CSV');
    console.log('=' .repeat(60));
    
    // Verificar que el archivo existe
    if (!fs.existsSync(csvFilePath)) {
        console.error('❌ Error: No se encuentra el archivo:', csvFilePath);
        console.log('\n📌 Uso: node import-google-contacts.js /ruta/al/archivo.csv');
        return;
    }
    
    console.log('📂 Archivo:', csvFilePath);
    
    const records = [];
    let headers = [];
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    try {
        // Leer y parsear CSV
        console.log('\n📖 Leyendo archivo CSV...');
        
        const parser = fs
            .createReadStream(csvFilePath)
            .pipe(parse({
                delimiter: ',',
                columns: true, // Usa la primera fila como headers
                skip_empty_lines: true,
                trim: true
            }));
        
        for await (const record of parser) {
            records.push(record);
        }
        
        console.log(`✅ ${records.length} contactos encontrados en el CSV\n`);
        
        if (records.length === 0) {
            console.log('⚠️ No hay contactos para importar');
            return;
        }
        
        // Mostrar muestra de campos disponibles
        console.log('📋 Campos detectados en el CSV:');
        const sampleRecord = records[0];
        const availableFields = Object.keys(sampleRecord);
        console.log(availableFields.slice(0, 10).join(', '));
        if (availableFields.length > 10) {
            console.log(`... y ${availableFields.length - 10} campos más`);
        }
        
        console.log('\n🔄 Procesando contactos...\n');
        
        // Procesar cada contacto
        for (const record of records) {
            try {
                // Extraer datos según formato de Google Contacts
                // Los nombres de campos pueden variar según el idioma
                
                // Buscar campo de nombre
                const name = record['Name'] || 
                           record['Nombre'] || 
                           record['Full Name'] ||
                           record['Display Name'] ||
                           `${record['Given Name'] || ''} ${record['Family Name'] || ''}`.trim() ||
                           `${record['First Name'] || ''} ${record['Last Name'] || ''}`.trim();
                
                // Buscar teléfonos (Google puede tener múltiples)
                let phone = null;
                for (const key of Object.keys(record)) {
                    if ((key.includes('Phone') || key.includes('Teléfono') || key.includes('Mobile')) 
                        && record[key]) {
                        phone = record[key];
                        break; // Tomar el primer teléfono encontrado
                    }
                }
                
                // Buscar email
                let email = null;
                for (const key of Object.keys(record)) {
                    if ((key.includes('E-mail') || key.includes('Email') || key.includes('Correo')) 
                        && record[key]) {
                        email = record[key];
                        break;
                    }
                }
                
                // Si no hay teléfono, saltar este contacto
                if (!phone) {
                    skippedCount++;
                    if (name) {
                        console.log(`⏭️ Saltando: ${name} (sin teléfono)`);
                    }
                    continue;
                }
                
                // Normalizar teléfono
                const normalizedPhone = await prisma.$queryRaw`
                    SELECT normalize_phone(${phone}) as normalized
                `;
                
                const phoneNumber = normalizedPhone[0]?.normalized;
                
                if (!phoneNumber) {
                    skippedCount++;
                    console.log(`⏭️ Saltando: ${name || 'Sin nombre'} (teléfono inválido: ${phone})`);
                    continue;
                }
                
                // Insertar o actualizar en Contactos
                const result = await prisma.$executeRaw`
                    INSERT INTO "Contactos" (
                        "phoneNumber",
                        "name",
                        "email",
                        "source",
                        "lastActivity",
                        "status",
                        "totalBookings",
                        "hasWhatsapp"
                    ) VALUES (
                        ${phoneNumber},
                        ${name || null},
                        ${email || null},
                        ARRAY['google'],
                        NOW(),
                        'active',
                        0,
                        false
                    )
                    ON CONFLICT ("phoneNumber") DO UPDATE SET
                        "name" = COALESCE("Contactos"."name", EXCLUDED."name"),
                        "email" = COALESCE("Contactos"."email", EXCLUDED."email"),
                        "source" = CASE 
                            WHEN 'google' = ANY("Contactos"."source") 
                            THEN "Contactos"."source"
                            ELSE array_append("Contactos"."source", 'google')
                        END,
                        "updatedAt" = NOW()
                `;
                
                processedCount++;
                
                // Mostrar progreso cada 50 contactos
                if (processedCount % 50 === 0) {
                    process.stdout.write(`\r✅ Procesados: ${processedCount} | ⏭️ Saltados: ${skippedCount}`);
                }
                
            } catch (error) {
                errorCount++;
                console.error(`\n❌ Error procesando contacto:`, error.message);
            }
        }
        
        console.log('\n'); // Nueva línea después del progreso
        
        // Estadísticas finales
        console.log('\n' + '=' .repeat(60));
        console.log('📊 RESUMEN DE IMPORTACIÓN:\n');
        console.log(`  📥 Contactos en CSV: ${records.length}`);
        console.log(`  ✅ Importados/Actualizados: ${processedCount}`);
        console.log(`  ⏭️ Saltados (sin teléfono): ${skippedCount}`);
        console.log(`  ❌ Errores: ${errorCount}`);
        
        // Verificar nuevos totales
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN 'google' = ANY("source") THEN 1 END) as desde_google,
                COUNT(CASE WHEN array_length("source", 1) > 1 THEN 1 END) as multiples_fuentes
            FROM "Contactos"
        `;
        
        console.log('\n📊 Estado actual de Contactos:');
        console.table(stats);
        
        // Mostrar algunos ejemplos importados
        const examples = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                "email",
                array_to_string("source", ', ') as fuentes
            FROM "Contactos"
            WHERE 'google' = ANY("source")
            ORDER BY "updatedAt" DESC
            LIMIT 5
        `;
        
        if (examples.length > 0) {
            console.log('\n📋 Últimos contactos importados de Google:');
            console.table(examples);
        }
        
        console.log('\n✅ IMPORTACIÓN COMPLETADA');
        
    } catch (error) {
        console.error('❌ Error general:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Obtener ruta del archivo desde argumentos
const csvPath = process.argv[2];

if (!csvPath) {
    console.log('📌 USO: node import-google-contacts.js /ruta/al/archivo.csv');
    console.log('\n📋 Formatos soportados:');
    console.log('  • Google Contacts CSV (exportado desde contacts.google.com)');
    console.log('  • Debe contener al menos: Name/Nombre y Phone/Teléfono');
    console.log('\n📥 Para exportar desde Google:');
    console.log('  1. Ve a contacts.google.com');
    console.log('  2. Selecciona contactos o "Todos"');
    console.log('  3. Click en "Exportar" > "Google CSV"');
    console.log('  4. Guarda el archivo y usa la ruta aquí');
} else {
    importGoogleContacts(csvPath);
}