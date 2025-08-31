import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keywords to exclude non-tourism related contacts
const EXCLUDE_KEYWORDS = [
    'abogado', 'juridico', 'cobranza', 'cobro', 
    'deuda', 'embargo', 'policia', 'fiscal',
    'juzgado', 'notaria', 'banco', 'financiera',
    'prestamo', 'credito', 'demanda', 'libertador',
    'acuerdo de pago', 'acuerdo pago'
];

// Parse the simple format
function parseSimpleFormat(data) {
    const contacts = [];
    const lines = data.split('\n');
    
    let currentContact = {};
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (!line) {
            // Empty line - save current contact if valid
            if (currentContact.telefono) {
                contacts.push({...currentContact});
            }
            currentContact = {};
            continue;
        }
        
        // Parse name (N: prefix)
        if (line.startsWith('N:')) {
            const name = line.substring(2).trim();
            if (name && name !== '???' && name !== '??' && !name.match(/^[\?!]+/)) {
                currentContact.nombre = cleanName(name);
            }
        }
        // Parse phone (TEL: or CELL: prefix)
        else if (line.startsWith('TEL:') || line.startsWith('CELL:')) {
            const phone = line.replace(/^(TEL:|CELL:)/, '').trim();
            const normalized = normalizePhone(phone);
            if (isValidMobileNumber(normalized)) {
                currentContact.telefono = normalized;
            }
        }
        // Parse full name (FN: prefix)
        else if (line.startsWith('FN:')) {
            const name = line.substring(3).trim();
            if (name && !currentContact.nombre) {
                currentContact.nombre = cleanName(name);
            }
        }
        // Parse organization (ORG: prefix)
        else if (line.startsWith('ORG:')) {
            const org = line.substring(4).trim();
            if (org) {
                currentContact.nota = org;
            }
        }
        // Parse note
        else if (line.startsWith('NOTE:')) {
            const note = line.substring(5).trim();
            if (note) {
                currentContact.nota = currentContact.nota 
                    ? `${currentContact.nota} - ${note}` 
                    : note;
            }
        }
        // Check if it's just a phone number
        else if (/^\+?\d{7,}$/.test(line)) {
            const normalized = normalizePhone(line);
            if (isValidMobileNumber(normalized)) {
                currentContact.telefono = normalized;
            }
        }
        // It might be a name without prefix
        else if (!line.includes(':') && 
                 !line.startsWith('BEGIN') && 
                 !line.startsWith('END') && 
                 !line.startsWith('VERSION') &&
                 line.length > 2 &&
                 !line.match(/^\d+$/)) {
            // Only set as name if we don't have one yet
            if (!currentContact.nombre) {
                const cleanedName = cleanName(line);
                if (cleanedName && cleanedName.length > 2) {
                    currentContact.nombre = cleanedName;
                }
            }
        }
    }
    
    // Don't forget the last contact
    if (currentContact.telefono) {
        contacts.push(currentContact);
    }
    
    return contacts;
}

function normalizePhone(phone) {
    if (!phone) return '';
    
    // Clean the phone number
    phone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '').trim();
    
    // Remove + if present for processing
    phone = phone.replace(/^\+/, '');
    
    // Colombian number without country code
    if (phone.startsWith('3') && phone.length === 10) {
        phone = '57' + phone;
    }
    
    // Add + back
    return '+' + phone;
}

function isValidMobileNumber(phone) {
    if (!phone) return false;
    
    const cleanPhone = phone.replace(/^\+/, '');
    
    // Colombian mobile
    if (cleanPhone.startsWith('57')) {
        return cleanPhone.length === 12 && cleanPhone[2] === '3';
    }
    
    // Colombian local format
    if (cleanPhone.startsWith('3')) {
        return cleanPhone.length === 10;
    }
    
    // International numbers (min 10 digits)
    return cleanPhone.length >= 10 && cleanPhone.length <= 15;
}

function cleanName(name) {
    if (!name) return '';
    
    // Remove question marks and special chars at the beginning
    name = name.replace(/^[\?!¿¡\-]+/, '');
    
    // Remove prefixes like "-alex" or similar
    name = name.replace(/^-\w+/, '');
    
    // Remove special characters but keep accents and basic punctuation
    name = name.replace(/[^\w\s\-'áéíóúñÁÉÍÓÚÑ.,]/gi, ' ');
    
    // Extract just the name part if it contains dates or apartment references
    // Remove dates at the end
    name = name.replace(/\s*-?\s*\d{1,2}\s*(de\s*)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre).*/gi, '');
    
    // Remove apartment references but keep the name
    name = name.replace(/\s*(apt?o?|habitaci[oó]n|hab|cuarto|room|suite)\s*[a-z0-9]+.*/gi, '');
    
    // Remove numbers at the beginning or end
    name = name.replace(/^\d+\s*/, '').replace(/\s*\d+$/, '');
    
    // Clean multiple spaces
    name = name.replace(/\s+/g, ' ').trim();
    
    // Skip if too short or just numbers
    if (name.length < 2 || /^\d+$/.test(name)) {
        return '';
    }
    
    // Capitalize first letter of each word
    name = name.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    
    return name;
}

function extractBookingInfo(text) {
    if (!text) return null;
    
    const info = [];
    
    // Extract dates
    const datePattern = /\d{1,2}\s*(de\s*)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/gi;
    const dates = text.match(datePattern);
    if (dates) {
        info.push(dates[0]); // Just the first date
    }
    
    // Extract apartment/room references
    const aptPattern = /(apt?o?|hab|room|suite)\s*[a-z0-9]+/gi;
    const apts = text.match(aptPattern);
    if (apts) {
        info.push(apts[0]);
    }
    
    // Extract year if present
    const yearPattern = /20\d{2}/g;
    const years = text.match(yearPattern);
    if (years) {
        info.push(years[0]);
    }
    
    return info.length > 0 ? info.join(' ') : null;
}

function shouldExclude(contact) {
    // Must have a phone number
    if (!contact.telefono) return true;
    
    const checkText = `${contact.nombre || ''} ${contact.nota || ''}`.toLowerCase();
    
    // Exclude if contains excluded keywords
    for (const keyword of EXCLUDE_KEYWORDS) {
        if (checkText.includes(keyword)) {
            return true;
        }
    }
    
    // Keep if has a name (even if no booking info)
    if (contact.nombre && contact.nombre.length > 2) {
        return false;
    }
    
    // If no name, only keep if has some booking reference
    const hasBookingInfo = /\d{1,2}.*(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/i.test(checkText) ||
                          /(apt?o?|hab|room|suite)\s*[a-z0-9]+/i.test(checkText) ||
                          /(reserva|booking|grupo|familia)/i.test(checkText);
    
    return !hasBookingInfo;
}

// Main execution
console.log('🚀 Procesando contactos (formato simple)...');
console.log('=' .repeat(60));

const rawFilePath = path.join(__dirname, '../raw-contacts-full.txt');
const fileStats = fs.statSync(rawFilePath);
console.log(`📂 Archivo: ${path.basename(rawFilePath)}`);
console.log(`📊 Tamaño: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

const rawData = fs.readFileSync(rawFilePath, 'utf-8');
const contacts = parseSimpleFormat(rawData);

console.log(`\n📖 Contactos parseados: ${contacts.length}`);

// Process and filter contacts
const validContacts = [];
const seenPhones = new Set();
let excluded = 0;
let duplicates = 0;

for (const contact of contacts) {
    // Skip duplicates
    if (seenPhones.has(contact.telefono)) {
        duplicates++;
        continue;
    }
    
    // Extract booking info from name if present
    const bookingInfo = extractBookingInfo(contact.nombre);
    if (bookingInfo && !contact.nota) {
        // Move booking info to nota and clean the name
        contact.nota = bookingInfo;
        contact.nombre = cleanName(contact.nombre);
    }
    
    // Skip if should be excluded
    if (shouldExclude(contact)) {
        excluded++;
        continue;
    }
    
    // Ensure nota is not undefined
    if (!contact.nota) {
        contact.nota = null;
    }
    
    seenPhones.add(contact.telefono);
    validContacts.push(contact);
}

// Sort: with names first, then by phone
validContacts.sort((a, b) => {
    if (a.nombre && !b.nombre) return -1;
    if (!a.nombre && b.nombre) return 1;
    if (a.nombre && b.nombre) return a.nombre.localeCompare(b.nombre);
    return a.telefono.localeCompare(b.telefono);
});

console.log(`\n📊 Resultados del procesamiento:`);
console.log(`✅ Contactos válidos: ${validContacts.length}`);
console.log(`❌ Excluidos (irrelevantes): ${excluded}`);
console.log(`🔄 Duplicados removidos: ${duplicates}`);
console.log(`👤 Con nombre: ${validContacts.filter(c => c.nombre).length}`);
console.log(`📝 Con notas/referencias: ${validContacts.filter(c => c.nota).length}`);

// Save full list
const outputPath = path.join(__dirname, '../contactos-limpios.json');
fs.writeFileSync(outputPath, JSON.stringify(validContacts, null, 2));

// Create sample for review (first 100)
const sample = validContacts.slice(0, 100);
const samplePath = path.join(__dirname, '../contactos-muestra.json');
fs.writeFileSync(samplePath, JSON.stringify(sample, null, 2));

console.log(`\n✅ Archivos generados:`);
console.log(`   📄 contactos-limpios.json (${validContacts.length} contactos)`);
console.log(`   📄 contactos-muestra.json (primeros 100 para revisión)`);

// Show statistics
const byCountry = {};
for (const contact of validContacts) {
    const prefix = contact.telefono.substring(0, 4);
    byCountry[prefix] = (byCountry[prefix] || 0) + 1;
}

console.log(`\n🌍 Top 10 países:`);
const sortedCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

for (const [prefix, count] of sortedCountries) {
    const countryName = 
        prefix === '+573' ? '🇨🇴 Colombia' :
        prefix === '+569' ? '🇨🇱 Chile' :
        prefix === '+549' ? '🇦🇷 Argentina' :
        prefix === '+593' ? '🇪🇨 Ecuador' :
        prefix === '+521' ? '🇲🇽 México' :
        prefix === '+507' ? '🇵🇦 Panamá' :
        prefix === '+506' ? '🇨🇷 Costa Rica' :
        prefix === '+519' ? '🇵🇪 Perú' :
        prefix === '+346' ? '🇪🇸 España' :
        'Otro';
    console.log(`   ${countryName} (${prefix}): ${count} contactos`);
}

// Show sample with names and notes
console.log(`\n📝 Muestra de contactos con nombres y notas:`);
const withInfo = validContacts
    .filter(c => c.nombre && c.nota)
    .slice(0, 5);

if (withInfo.length > 0) {
    console.table(withInfo);
} else {
    console.log('   (No se encontraron contactos con nombre y nota)');
}

// Show sample with names only
console.log(`\n👤 Muestra de contactos con nombres:`);
const withNames = validContacts
    .filter(c => c.nombre)
    .slice(0, 10);

if (withNames.length > 0) {
    console.table(withNames);
}