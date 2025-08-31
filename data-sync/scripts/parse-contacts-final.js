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
                currentContact.rawName = name;
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
            if (name && !currentContact.rawName) {
                currentContact.rawName = name;
            }
        }
        // Parse organization (ORG: prefix)
        else if (line.startsWith('ORG:')) {
            const org = line.substring(4).trim();
            if (org) {
                currentContact.orgNote = org;
            }
        }
        // Parse note
        else if (line.startsWith('NOTE:')) {
            const note = line.substring(5).trim();
            if (note) {
                currentContact.extraNote = note;
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
            if (!currentContact.rawName) {
                if (line.length > 2) {
                    currentContact.rawName = line;
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

function extractNameAndNote(rawName) {
    if (!rawName) return { nombre: '', nota: null };
    
    let name = rawName;
    const noteParts = [];
    
    // Remove question marks and special chars at the beginning
    name = name.replace(/^[\?!¿¡]+/, '');
    
    // Extract complex date patterns first (e.g., "01 04 2025Jesus Ocampo1317")
    const complexDateMatch = name.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})(.+?)$/);
    if (complexDateMatch) {
        noteParts.push(`${complexDateMatch[1]}/${complexDateMatch[2]}/${complexDateMatch[3]}`);
        name = complexDateMatch[4];
    }
    
    // Extract date with month name (e.g., "01 Julio 2024lorena Ramos")
    const monthDateMatch = name.match(/^(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})(.+)$/i);
    if (monthDateMatch) {
        noteParts.push(`${monthDateMatch[1]} ${monthDateMatch[2]} ${monthDateMatch[3]}`);
        name = monthDateMatch[4];
    }
    
    // Extract short date patterns (e.g., "01 21jhon" or "02-21alejandra")
    const shortDateMatch = name.match(/^(\d{1,2})[\s-](\d{2})(.+)$/);
    if (shortDateMatch && !complexDateMatch) {
        noteParts.push(`${shortDateMatch[1]}-20${shortDateMatch[2]}`);
        name = shortDateMatch[3];
    }
    
    // Extract year prefix (e.g., "2024carolina" -> carolina, note: 2024)
    const yearPrefixMatch = name.match(/^(20\d{2})(.+)/);
    if (yearPrefixMatch && !complexDateMatch) {
        noteParts.push(yearPrefixMatch[1]);
        name = yearPrefixMatch[2];
    }
    
    // Extract date prefix with dash (e.g., "-21adriana" or "-03-21daniel")
    const datePrefixMatch = name.match(/^-(\d{1,2}(?:-\d{1,2})?)(.*)/);
    if (datePrefixMatch) {
        const dateRef = datePrefixMatch[1].length <= 2 ? `20${datePrefixMatch[1]}` : datePrefixMatch[1];
        noteParts.push(dateRef);
        name = datePrefixMatch[2];
    }
    
    // Extract month-year prefix (e.g., "-may-21kelly")
    const monthPrefixMatch = name.match(/^-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)-(\d{2})(.*)/i);
    if (monthPrefixMatch) {
        noteParts.push(`${monthPrefixMatch[1]}-20${monthPrefixMatch[2]}`);
        name = monthPrefixMatch[3];
    }
    
    // Extract apartment numbers that are attached to name (e.g., "Ocampo1317")
    const attachedAptMatch = name.match(/^(.+?)(\d{4}[a-z]?)$/i);
    if (attachedAptMatch && attachedAptMatch[1].length > 2) {
        name = attachedAptMatch[1];
        noteParts.push(`Apt ${attachedAptMatch[2]}`);
    }
    
    // Extract apartment/room reference with space (e.g., "carolina 2005b" or "sandra 1722a")
    const aptMatch = name.match(/^(.+?)\s+(\d{3,4}[a-z]?)$/i);
    if (aptMatch && !attachedAptMatch) {
        name = aptMatch[1];
        noteParts.push(`Apt ${aptMatch[2].toUpperCase()}`);
    }
    
    // Extract booking platform references
    const platformMatch = name.match(/^(.+?)\s+(booking|airbnb|expedia|google|post|pos)$/i);
    if (platformMatch) {
        name = platformMatch[1];
        noteParts.push(platformMatch[2]);
    }
    
    // Clean remaining prefixes and special characters
    name = name.replace(/^[-\s,]+/, '');
    name = name.replace(/[^\w\s'áéíóúñÁÉÍÓÚÑ]/gi, ' ');
    
    // Clean multiple spaces
    name = name.replace(/\s+/g, ' ').trim();
    
    // Capitalize properly
    name = capitalizeWords(name);
    
    // Build the note
    let nota = null;
    if (noteParts.length > 0) {
        // Format the note nicely
        const year = noteParts.find(p => /^20\d{2}$/.test(p));
        const apt = noteParts.find(p => p.startsWith('Apt '));
        const platform = noteParts.find(p => /^(booking|airbnb|expedia|google|post|pos)$/i.test(p));
        const date = noteParts.find(p => p.includes('/') || p.includes('-20'));
        const monthDate = noteParts.find(p => /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(p));
        
        const formattedParts = [];
        if (apt) formattedParts.push(`Reservó ${apt}`);
        if (year && !date && !monthDate) formattedParts.push(`en ${year}`);
        if (date && !monthDate) formattedParts.push(date);
        if (monthDate) formattedParts.push(monthDate);
        if (platform) formattedParts.push(`vía ${platform}`);
        
        nota = formattedParts.join(' ');
    }
    
    return { nombre: name, nota: nota };
}

function capitalizeWords(str) {
    if (!str) return '';
    
    // List of words that should stay lowercase
    const lowercase = ['de', 'del', 'la', 'el', 'los', 'las', 'y'];
    
    return str.split(' ')
        .map((word, index) => {
            // Always capitalize first word
            if (index === 0) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            // Check if it should stay lowercase
            if (lowercase.includes(word.toLowerCase())) {
                return word.toLowerCase();
            }
            // Capitalize normally
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
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
    
    // Keep if has a name
    if (contact.nombre && contact.nombre.length > 2) {
        return false;
    }
    
    // If no name, only keep if has some note
    return !contact.nota;
}

// Main execution
console.log('🚀 Procesando contactos con separación inteligente...');
console.log('=' .repeat(60));

const rawFilePath = path.join(__dirname, '../raw-contacts-full.txt');
const fileStats = fs.statSync(rawFilePath);
console.log(`📂 Archivo: ${path.basename(rawFilePath)}`);
console.log(`📊 Tamaño: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

const rawData = fs.readFileSync(rawFilePath, 'utf-8');
const rawContacts = parseSimpleFormat(rawData);

console.log(`\n📖 Contactos parseados: ${rawContacts.length}`);

// Process and filter contacts
const validContacts = [];
const seenPhones = new Set();
let excluded = 0;
let duplicates = 0;

for (const rawContact of rawContacts) {
    // Skip duplicates
    if (seenPhones.has(rawContact.telefono)) {
        duplicates++;
        continue;
    }
    
    // Extract name and note from rawName
    const { nombre, nota } = extractNameAndNote(rawContact.rawName);
    
    // Build final note combining all sources
    const finalNoteParts = [];
    if (nota) finalNoteParts.push(nota);
    if (rawContact.orgNote) finalNoteParts.push(rawContact.orgNote);
    if (rawContact.extraNote) finalNoteParts.push(rawContact.extraNote);
    
    const contact = {
        nombre: nombre || null,
        telefono: rawContact.telefono,
        nota: finalNoteParts.length > 0 ? finalNoteParts.join(' - ') : null
    };
    
    // Skip if should be excluded
    if (shouldExclude(contact)) {
        excluded++;
        continue;
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
const outputPath = path.join(__dirname, '../contactos-finales.json');
fs.writeFileSync(outputPath, JSON.stringify(validContacts, null, 2));

// Create sample for review (first 100)
const sample = validContacts.slice(0, 100);
const samplePath = path.join(__dirname, '../contactos-muestra-final.json');
fs.writeFileSync(samplePath, JSON.stringify(sample, null, 2));

console.log(`\n✅ Archivos generados:`);
console.log(`   📄 contactos-finales.json (${validContacts.length} contactos)`);
console.log(`   📄 contactos-muestra-final.json (primeros 100 para revisión)`);

// Show sample with improved extraction
console.log(`\n📝 Muestra de contactos con extracción mejorada:`);
const withNotes = validContacts.filter(c => c.nota).slice(0, 10);

if (withNotes.length > 0) {
    console.log('');
    for (const contact of withNotes) {
        console.log(`👤 ${contact.nombre || '(sin nombre)'}`);
        console.log(`   📱 ${contact.telefono}`);
        console.log(`   📝 ${contact.nota}`);
        console.log('   ' + '-'.repeat(50));
    }
}