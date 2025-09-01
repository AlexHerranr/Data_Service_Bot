import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function importContacts() {
    console.log('🚀 Starting import of cleaned contacts to Contactos table');
    console.log('=' .repeat(60));
    
    try {
        // Read cleaned contacts
        const cleanedPath = path.join(__dirname, '../cleaned-contacts.json');
        const cleanedContacts = JSON.parse(fs.readFileSync(cleanedPath, 'utf-8'));
        
        console.log(`📋 Found ${cleanedContacts.length} contacts to import`);
        
        // Get existing phone numbers to avoid duplicates
        const existingPhones = await prisma.$queryRaw`
            SELECT "phoneNumber" FROM "Contactos"
        `;
        const existingSet = new Set(existingPhones.map(p => p.phoneNumber));
        
        // Filter out existing contacts
        const newContacts = cleanedContacts.filter(c => !existingSet.has(c.phone));
        
        console.log(`🆕 ${newContacts.length} are new contacts`);
        console.log(`⏭️  ${cleanedContacts.length - newContacts.length} already exist (skipping)`);
        
        if (newContacts.length === 0) {
            console.log('✅ No new contacts to import');
            return;
        }
        
        // Prepare batch insert
        const batchSize = 100;
        let imported = 0;
        let errors = 0;
        
        for (let i = 0; i < newContacts.length; i += batchSize) {
            const batch = newContacts.slice(i, i + batchSize);
            
            try {
                // Build values for batch insert
                const values = batch.map(contact => {
                    const name = contact.name ? `'${contact.name.replace(/'/g, "''")}'` : 'NULL';
                    return `('${contact.phone}', ${name}, ARRAY['csv_import']::text[], 'active', NOW(), NOW())`;
                }).join(',\n');
                
                await prisma.$executeRawUnsafe(`
                    INSERT INTO "Contactos" (
                        "phoneNumber", 
                        "name", 
                        "source", 
                        "status",
                        "createdAt",
                        "updatedAt"
                    ) VALUES ${values}
                    ON CONFLICT ("phoneNumber") DO UPDATE SET
                        "name" = COALESCE(EXCLUDED."name", "Contactos"."name"),
                        "source" = array_append(
                            CASE 
                                WHEN 'csv_import' = ANY("Contactos"."source") THEN "Contactos"."source"
                                ELSE "Contactos"."source"
                            END,
                            'csv_import'
                        ),
                        "updatedAt" = NOW()
                `);
                
                imported += batch.length;
                
                // Progress indicator
                const progress = Math.round((i + batch.length) / newContacts.length * 100);
                console.log(`📊 Progress: ${progress}% (${imported}/${newContacts.length})`);
                
            } catch (error) {
                console.error(`❌ Error importing batch ${i}-${i + batch.length}:`, error.message);
                errors += batch.length;
            }
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('📈 IMPORT SUMMARY:');
        console.log(`✅ Successfully imported: ${imported} contacts`);
        if (errors > 0) {
            console.log(`❌ Failed: ${errors} contacts`);
        }
        
        // Get final statistics
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN 'csv_import' = ANY("source") THEN 1 END) as from_csv,
                COUNT(CASE WHEN "name" IS NOT NULL THEN 1 END) as with_names
            FROM "Contactos"
        `;
        
        console.log('\n📊 CURRENT DATABASE STATS:');
        console.log(`Total contacts: ${stats[0].total}`);
        console.log(`From CSV imports: ${stats[0].from_csv}`);
        console.log(`With names: ${stats[0].with_names}`);
        
        // Show sample of imported contacts
        const sample = await prisma.$queryRaw`
            SELECT 
                "phoneNumber",
                "name",
                array_to_string("source", ', ') as sources
            FROM "Contactos"
            WHERE 'csv_import' = ANY("source")
            ORDER BY "createdAt" DESC
            LIMIT 5
        `;
        
        if (sample.length > 0) {
            console.log('\n📝 Sample of recently imported:');
            console.table(sample);
        }
        
    } catch (error) {
        console.error('❌ Fatal error during import:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Add command line option to use a different file
const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`
Usage: node import-cleaned-contacts.js [options]

Options:
  --dry-run    Show what would be imported without actually importing
  --help       Show this help message

The script imports contacts from cleaned-contacts.json into the Contactos table.
    `);
    process.exit(0);
}

// Run import
importContacts().catch(error => {
    console.error('Failed to import contacts:', error);
    process.exit(1);
});