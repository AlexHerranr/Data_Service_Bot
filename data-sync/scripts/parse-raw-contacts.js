import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the raw contact data - check for full file first, then fallback
const rawFilePath = fs.existsSync(path.join(__dirname, '../raw-contacts-full.txt')) 
    ? path.join(__dirname, '../raw-contacts-full.txt')
    : path.join(__dirname, '../raw-contacts.txt');

console.log(`📂 Leyendo archivo: ${path.basename(rawFilePath)}`);
const fileStats = fs.statSync(rawFilePath);
console.log(`📊 Tamaño del archivo: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

const rawData = fs.readFileSync(rawFilePath, 'utf-8');

// Parse contacts into structured data
function parseContacts(data) {
    const contacts = [];
    const lines = data.split('\n');
    
    let currentContact = {};
    
    for (let line of lines) {
        line = line.trim();
        
        if (!line) {
            // Empty line - save current contact if it has data
            if (currentContact.phone || currentContact.name) {
                contacts.push({...currentContact});
                currentContact = {};
            }
            continue;
        }
        
        // Parse different formats
        if (line.startsWith('N:')) {
            // Name field
            currentContact.name = line.substring(2).trim();
        } else if (line.startsWith('FN:')) {
            // Full name field
            if (!currentContact.name) {
                currentContact.name = line.substring(3).trim();
            }
        } else if (line.startsWith('TEL:') || line.startsWith('CELL:')) {
            // Phone number
            let phone = line.replace(/^(TEL:|CELL:)/, '').trim();
            currentContact.phone = phone;
        } else if (line.includes(':') && !line.startsWith('NOTE:') && !line.startsWith('ADR:')) {
            // Other phone format patterns
            const parts = line.split(':');
            if (parts.length === 2 && /^\+?\d+$/.test(parts[1].trim())) {
                currentContact.phone = parts[1].trim();
            }
        } else if (/^\+?\d{7,}$/.test(line)) {
            // Just a phone number on its own line
            currentContact.phone = line;
        } else if (!line.startsWith('NOTE:') && !line.startsWith('ADR:') && !line.includes('BEGIN:') && !line.includes('END:') && !line.includes('VERSION:')) {
            // Might be a name if no special prefix
            if (!currentContact.name && line.length > 2 && !line.match(/^\d+$/)) {
                currentContact.name = line;
            }
        }
    }
    
    // Don't forget the last contact
    if (currentContact.phone || currentContact.name) {
        contacts.push(currentContact);
    }
    
    return contacts;
}

// Clean and filter contacts
function cleanContacts(contacts) {
    const cleaned = [];
    const seenPhones = new Set();
    
    // Keywords to exclude (tourism-irrelevant contacts)
    const excludeKeywords = [
        'acuerdo de pago',
        'abogado',
        'libertador',
        'cobranza',
        'deuda',
        'juridico',
        'demanda',
        'embargo',
        'policia',
        'fiscalia',
        'juzgado',
        'notaria',
        'banco',
        'financiera',
        'prestamo',
        'credito'
    ];
    
    for (let contact of contacts) {
        // Skip if no phone
        if (!contact.phone) continue;
        
        // Clean phone number
        let phone = contact.phone
            .replace(/\s+/g, '')
            .replace(/[^\d+]/g, '')
            .trim();
        
        // Skip if not a valid mobile number
        if (!isValidMobileNumber(phone)) continue;
        
        // Normalize phone to Colombian format if needed
        phone = normalizePhone(phone);
        
        // Skip duplicates
        if (seenPhones.has(phone)) continue;
        
        // Clean name
        let name = (contact.name || '').trim();
        
        // Remove apartment references, notes, etc.
        name = cleanName(name);
        
        // Check for excluded keywords
        const nameLower = name.toLowerCase();
        const shouldExclude = excludeKeywords.some(keyword => 
            nameLower.includes(keyword)
        );
        
        if (shouldExclude) continue;
        
        // Add to cleaned list
        seenPhones.add(phone);
        cleaned.push({
            phone: phone,
            name: name || null
        });
    }
    
    return cleaned;
}

function isValidMobileNumber(phone) {
    // Remove any + at the beginning for checking
    const cleanPhone = phone.replace(/^\+/, '');
    
    // Colombian mobile: starts with 57 and has 12 digits total, or just 10 digits starting with 3
    if (cleanPhone.startsWith('57')) {
        // Full international format
        if (cleanPhone.length === 12 && cleanPhone[2] === '3') {
            return true;
        }
    } else if (cleanPhone.startsWith('3')) {
        // Local format
        if (cleanPhone.length === 10) {
            return true;
        }
    } else if (cleanPhone.length >= 10) {
        // Other international numbers (keep if mobile-like length)
        return true;
    }
    
    return false;
}

function normalizePhone(phone) {
    // Remove + if present
    phone = phone.replace(/^\+/, '');
    
    // If it's a Colombian number without country code, add it
    if (phone.startsWith('3') && phone.length === 10) {
        phone = '57' + phone;
    }
    
    // Add + back
    return '+' + phone;
}

function cleanName(name) {
    if (!name) return '';
    
    // Remove common suffixes/notes
    name = name.replace(/\s*\(.*?\)\s*/g, ''); // Remove parenthetical notes
    name = name.replace(/\s*-\s*apt.*$/i, ''); // Remove apartment references
    name = name.replace(/\s*-\s*apto.*$/i, '');
    name = name.replace(/\s*-\s*casa.*$/i, '');
    name = name.replace(/\s*-\s*oficina.*$/i, '');
    name = name.replace(/\s*\d{3,}.*$/i, ''); // Remove trailing numbers (apt numbers, etc.)
    
    // Remove special characters except spaces and basic punctuation
    name = name.replace(/[^\w\s\-'áéíóúñÁÉÍÓÚÑ]/gi, ' ');
    
    // Clean up multiple spaces
    name = name.replace(/\s+/g, ' ').trim();
    
    // Skip if name is just numbers or too short
    if (/^\d+$/.test(name) || name.length < 2) {
        return '';
    }
    
    // Skip if name looks like a code or ID
    if (/^[A-Z0-9]{2,10}$/.test(name)) {
        return '';
    }
    
    return name;
}

// Main execution
console.log('📖 Parsing raw contact data...');
const contacts = parseContacts(rawData);
console.log(`Found ${contacts.length} raw contacts`);

console.log('🧹 Cleaning and filtering contacts...');
const cleanedContacts = cleanContacts(contacts);
console.log(`Cleaned to ${cleanedContacts.length} valid mobile contacts`);

// Sort by phone for easier review
cleanedContacts.sort((a, b) => a.phone.localeCompare(b.phone));

// Save to JSON for review
const outputPath = path.join(__dirname, '../cleaned-contacts.json');
fs.writeFileSync(outputPath, JSON.stringify(cleanedContacts, null, 2));

// Also create a CSV for easier review
const csvPath = path.join(__dirname, '../cleaned-contacts.csv');
const csvContent = 'phone,name\n' + 
    cleanedContacts.map(c => `"${c.phone}","${c.name || ''}"`).join('\n');
fs.writeFileSync(csvPath, csvContent);

// Generate summary statistics
const stats = {
    totalCleaned: cleanedContacts.length,
    withNames: cleanedContacts.filter(c => c.name).length,
    withoutNames: cleanedContacts.filter(c => !c.name).length,
    byCountry: {}
};

// Count by country code
for (let contact of cleanedContacts) {
    const countryCode = contact.phone.substring(0, 4); // Get first few digits for country
    stats.byCountry[countryCode] = (stats.byCountry[countryCode] || 0) + 1;
}

console.log('\n📊 Statistics:');
console.log(`Total cleaned contacts: ${stats.totalCleaned}`);
console.log(`With names: ${stats.withNames}`);
console.log(`Without names: ${stats.withoutNames}`);
console.log('\nBy country code prefix:');
Object.entries(stats.byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([code, count]) => {
        console.log(`  ${code}...: ${count} contacts`);
    });

console.log(`\n✅ Cleaned contacts saved to:`);
console.log(`   - JSON: ${outputPath}`);
console.log(`   - CSV: ${csvPath}`);