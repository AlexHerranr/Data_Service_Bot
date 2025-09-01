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

// Month names in Spanish
const MONTHS = {
    'ene': 'Enero', 'enero': 'Enero',
    'feb': 'Febrero', 'febrero': 'Febrero',
    'mar': 'Marzo', 'marzo': 'Marzo',
    'abr': 'Abril', 'abril': 'Abril',
    'may': 'Mayo', 'mayo': 'Mayo',
    'jun': 'Junio', 'junio': 'Junio',
    'jul': 'Julio', 'julio': 'Julio',
    'ago': 'Agosto', 'agosto': 'Agosto',
    'sep': 'Septiembre', 'septiembre': 'Septiembre',
    'oct': 'Octubre', 'octubre': 'Octubre',
    'nov': 'Noviembre', 'noviembre': 'Noviembre',
    'dic': 'Diciembre', 'diciembre': 'Diciembre'
};

// Parse the simple format
function parseSimpleFormat(data) {
    const contacts = [];
    const lines = data.split('\n');
    
    let currentContact = {};
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (!line) {
            if (currentContact.telefono) {
                contacts.push({...currentContact});
            }
            currentContact = {};
            continue;
        }
        
        if (line.startsWith('N:')) {
            const name = line.substring(2).trim();
            if (name && name !== '???' && name !== '??' && !name.match(/^[\?!]+/)) {
                currentContact.rawName = name;
            }
        }
        else if (line.startsWith('TEL:') || line.startsWith('CELL:')) {
            const phone = line.replace(/^(TEL:|CELL:)/, '').trim();
            const normalized = normalizePhone(phone);
            if (isValidMobileNumber(normalized)) {
                currentContact.telefono = normalized;
            }
        }
        else if (line.startsWith('FN:')) {
            const name = line.substring(3).trim();
            if (name && !currentContact.rawName) {
                currentContact.rawName = name;
            }
        }
        else if (line.startsWith('ORG:')) {
            const org = line.substring(4).trim();
            if (org) {
                currentContact.orgNote = org;
            }
        }
        else if (line.startsWith('NOTE:')) {
            const note = line.substring(5).trim();
            if (note) {
                currentContact.extraNote = note;
            }
        }
        else if (/^\+?\d{7,}$/.test(line)) {
            const normalized = normalizePhone(line);
            if (isValidMobileNumber(normalized)) {
                currentContact.telefono = normalized;
            }
        }
        else if (!line.includes(':') && 
                 !line.startsWith('BEGIN') && 
                 !line.startsWith('END') && 
                 !line.startsWith('VERSION') &&
                 line.length > 2 &&
                 !line.match(/^\d+$/)) {
            if (!currentContact.rawName) {
                if (line.length > 2) {
                    currentContact.rawName = line;
                }
            }
        }
    }
    
    if (currentContact.telefono) {
        contacts.push(currentContact);
    }
    
    return contacts;
}

function normalizePhone(phone) {
    if (!phone) return '';
    
    phone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '').trim();
    phone = phone.replace(/^\+/, '');
    
    // Fix numbers starting with 00 (should be +)
    if (phone.startsWith('00')) {
        phone = phone.substring(2);
    }
    
    // Colombian number without country code
    if (phone.startsWith('3') && phone.length === 10) {
        phone = '57' + phone;
    }
    
    return '+' + phone;
}

function isValidMobileNumber(phone) {
    if (!phone) return false;
    
    const cleanPhone = phone.replace(/^\+/, '');
    
    // Skip obviously invalid numbers
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        return false;
    }
    
    // Skip numbers with invalid patterns (like 00987801327)
    if (cleanPhone.startsWith('0')) {
        return false;
    }
    
    // Colombian mobile
    if (cleanPhone.startsWith('57')) {
        return cleanPhone.length === 12 && cleanPhone[2] === '3';
    }
    
    // Colombian local format
    if (cleanPhone.startsWith('3')) {
        return cleanPhone.length === 10;
    }
    
    // International numbers - be more strict
    // Must start with a valid country code (1-999)
    const countryCode = cleanPhone.substring(0, 3);
    if (parseInt(countryCode) > 0 && parseInt(countryCode) < 1000) {
        return true;
    }
    
    return false;
}

function extractNameAndNote(rawName) {
    if (!rawName) return { nombre: '', nota: null };
    
    let name = rawName;
    const noteParts = [];
    
    // Remove question marks and special chars at the beginning
    name = name.replace(/^[\?!¿¡]+/, '');
    
    // Special case: numbers at the beginning that look like phone numbers
    // e.g., "00987801327natalia Escate1820 Lun 5 Feb"
    const phoneAtStartMatch = name.match(/^(\d{8,15})(.+)$/);
    if (phoneAtStartMatch) {
        // Skip the phone number part
        name = phoneAtStartMatch[2];
    }
    
    // FIRST: Extract all date patterns from the beginning
    // Pattern 1: "01 04 2025" at the start
    let dateExtracted = false;
    const fullDateMatch = name.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})\s*(.*)$/);
    if (fullDateMatch) {
        const day = fullDateMatch[1];
        const month = fullDateMatch[2];
        const year = fullDateMatch[3];
        noteParts.push(`${day}/${month}/${year}`);
        name = fullDateMatch[4].trim();
        dateExtracted = true;
    }
    
    // Pattern 2: "01 Julio 2024" at the start
    if (!dateExtracted) {
        const monthNameMatch = name.match(/^(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})\s*(.*)$/i);
        if (monthNameMatch) {
            noteParts.push(`${monthNameMatch[1]} de ${monthNameMatch[2]} ${monthNameMatch[3]}`);
            name = monthNameMatch[4].trim();
            dateExtracted = true;
        }
    }
    
    // Pattern 3: "01 Julio" or "08 Feb" at the start
    if (!dateExtracted) {
        const shortMonthMatch = name.match(/^(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(.*)$/i);
        if (shortMonthMatch) {
            const monthName = MONTHS[shortMonthMatch[2].toLowerCase()] || shortMonthMatch[2];
            noteParts.push(`${shortMonthMatch[1]} de ${monthName}`);
            name = shortMonthMatch[3].trim();
            dateExtracted = true;
        }
    }
    
    // Pattern 4: "01 21" or "02-21" (month year) at the start
    if (!dateExtracted) {
        const shortDateMatch = name.match(/^(\d{1,2})[\s-](\d{2})\s*(.*)$/);
        if (shortDateMatch) {
            const month = shortDateMatch[1];
            const year = `20${shortDateMatch[2]}`;
            noteParts.push(`${month}/${year}`);
            name = shortDateMatch[3].trim();
            dateExtracted = true;
        }
    }
    
    // Pattern 5: "2024" at the start
    if (!dateExtracted) {
        const yearOnlyMatch = name.match(/^(20\d{2})\s*(.*)$/);
        if (yearOnlyMatch) {
            noteParts.push(yearOnlyMatch[1]);
            name = yearOnlyMatch[2].trim();
            dateExtracted = true;
        }
    }
    
    // Now extract apartment numbers and other patterns from the remaining name
    // Pattern: "natalia Escate1820 Lun 5 Feb"
    const complexPattern = name.match(/^(.+?)(\d{4}[a-z]?)\s+(lun|mar|mié|jue|vie|sáb|dom)?\s*(\d{1,2})?\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)?/i);
    if (complexPattern) {
        name = complexPattern[1].trim();
        const apt = complexPattern[2];
        const day = complexPattern[4];
        const month = complexPattern[5];
        
        if (apt && apt.length >= 3) {
            const aptNum = parseInt(apt);
            // Only treat as year if it's 2020-2029 and no letter suffix
            if (apt.length === 4 && !apt.match(/[a-z]/i) && aptNum >= 2020 && aptNum <= 2029) {
                if (!dateExtracted) noteParts.push(`${apt}`);
            } else {
                noteParts.push(`Apt ${apt.toUpperCase()}`);
            }
        }
        
        if (day && month) {
            const monthName = MONTHS[month.toLowerCase()] || month;
            noteParts.push(`${day} de ${monthName}`);
        }
    } else {
        // Extract apartment attached to name (e.g., "Ocampo1317")
        const attachedAptMatch = name.match(/^(.+?)(\d{3,4}[a-z]?)$/i);
        if (attachedAptMatch && attachedAptMatch[1].length > 2) {
            name = attachedAptMatch[1];
            const aptCode = attachedAptMatch[2];
            const aptNum = parseInt(aptCode);
            
            // Only treat as year if it's exactly 4 digits, no letters, and 2020-2029
            if (aptCode.length === 4 && !aptCode.match(/[a-z]/i) && aptNum >= 2020 && aptNum <= 2029) {
                if (!dateExtracted) noteParts.push(aptNum.toString());
            } else {
                noteParts.push(`Apt ${aptCode.toUpperCase()}`);
            }
        }
        
        // Extract apartment with space (e.g., "carolina 2005b")
        const aptWithSpaceMatch = name.match(/^(.+?)\s+(\d{3,4}[a-z]?)$/i);
        if (aptWithSpaceMatch && !attachedAptMatch) {
            name = aptWithSpaceMatch[1];
            const aptCode = aptWithSpaceMatch[2];
            const aptNum = parseInt(aptCode);
            
            // Only treat as year if it's exactly 4 digits, no letters, and 2020-2029
            if (aptCode.length === 4 && !aptCode.match(/[a-z]/i) && aptNum >= 2020 && aptNum <= 2029) {
                if (!dateExtracted) noteParts.push(aptNum.toString());
            } else {
                noteParts.push(`Apt ${aptCode.toUpperCase()}`);
            }
        }
    }
    
    // Extract platform references
    const platformMatch = name.match(/^(.+?)\s+(booking|airbnb|expedia|google|post|pos)$/i);
    if (platformMatch) {
        name = platformMatch[1];
        noteParts.push(`vía ${platformMatch[2]}`);
    }
    
    // Clean prefixes with dates
    name = name.replace(/^-(\d{1,2})-?(\d{1,2})?/, '');
    name = name.replace(/^-?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)-(\d{2})/i, '');
    
    // Clean remaining prefixes
    name = name.replace(/^[-\s,]+/, '');
    name = name.replace(/[^\w\s'áéíóúñÁÉÍÓÚÑ]/gi, ' ');
    
    // Remove apartment codes that might still be in the name
    name = name.replace(/\b\d{4}[a-z]?\b/gi, '');
    
    // Clean multiple spaces
    name = name.replace(/\s+/g, ' ').trim();
    
    // Capitalize properly
    name = capitalizeWords(name);
    
    // Build the note - be smarter about it
    let nota = null;
    if (noteParts.length > 0) {
        // Remove duplicate years that were mistaken for apartments
        const cleanedParts = [];
        const years = [];
        const apts = [];
        const dates = [];
        const others = [];
        
        for (const part of noteParts) {
            if (/^20\d{2}$/.test(part)) {
                years.push(part);
            } else if (part.startsWith('Apt ')) {
                apts.push(part);
            } else if (part.includes('/') || part.includes(' de ')) {
                dates.push(part);
            } else {
                others.push(part);
            }
        }
        
        // Build final note
        if (apts.length > 0) cleanedParts.push(`Reservó ${apts[0]}`);
        if (dates.length > 0) cleanedParts.push(dates[0]);
        else if (years.length > 0) cleanedParts.push(`en ${years[0]}`);
        others.forEach(o => cleanedParts.push(o));
        
        nota = cleanedParts.join(' - ');
    }
    
    return { nombre: name, nota: nota };
}

function capitalizeWords(str) {
    if (!str) return '';
    
    const lowercase = ['de', 'del', 'la', 'el', 'los', 'las', 'y'];
    
    return str.split(' ')
        .map((word, index) => {
            if (index === 0) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            if (lowercase.includes(word.toLowerCase())) {
                return word.toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

function shouldExclude(contact) {
    if (!contact.telefono) return true;
    
    const checkText = `${contact.nombre || ''} ${contact.nota || ''}`.toLowerCase();
    
    for (const keyword of EXCLUDE_KEYWORDS) {
        if (checkText.includes(keyword)) {
            return true;
        }
    }
    
    // Keep if has a valid name (at least 2 characters)
    if (contact.nombre && contact.nombre.length >= 2) {
        return false;
    }
    
    // If no name, only keep if has a note
    return !contact.nota;
}

// Main execution
console.log('🚀 Procesando contactos con ULTRA limpieza...');
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
let invalidPhones = 0;

for (const rawContact of rawContacts) {
    // Skip invalid phone numbers
    if (!rawContact.telefono || rawContact.telefono.length < 10) {
        invalidPhones++;
        continue;
    }
    
    // Skip duplicates
    if (seenPhones.has(rawContact.telefono)) {
        duplicates++;
        continue;
    }
    
    // Extract name and note
    const { nombre, nota } = extractNameAndNote(rawContact.rawName);
    
    // Build final note
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

// Sort by name quality, then alphabetically
validContacts.sort((a, b) => {
    // Prioritize contacts with both name and note
    if (a.nombre && a.nota && (!b.nombre || !b.nota)) return -1;
    if (b.nombre && b.nota && (!a.nombre || !a.nota)) return 1;
    
    // Then contacts with names
    if (a.nombre && !b.nombre) return -1;
    if (!a.nombre && b.nombre) return 1;
    
    // Alphabetically by name
    if (a.nombre && b.nombre) return a.nombre.localeCompare(b.nombre);
    
    return a.telefono.localeCompare(b.telefono);
});

console.log(`\n📊 Resultados del procesamiento ULTRA:`);
console.log(`✅ Contactos válidos: ${validContacts.length}`);
console.log(`❌ Teléfonos inválidos: ${invalidPhones}`);
console.log(`❌ Excluidos (irrelevantes): ${excluded}`);
console.log(`🔄 Duplicados removidos: ${duplicates}`);
console.log(`👤 Con nombre: ${validContacts.filter(c => c.nombre).length}`);
console.log(`📝 Con notas/referencias: ${validContacts.filter(c => c.nota).length}`);

// Save to desktop (root of workspace)
const desktopPath = '/workspace';
const outputPath = path.join(desktopPath, 'contactos_limpios_final.json');
const samplePath = path.join(desktopPath, 'contactos_muestra_final.json');

fs.writeFileSync(outputPath, JSON.stringify(validContacts, null, 2));
fs.writeFileSync(samplePath, JSON.stringify(validContacts.slice(0, 100), null, 2));

console.log(`\n✅ Archivos guardados en el escritorio:`);
console.log(`   📄 ${outputPath}`);
console.log(`   📄 ${samplePath}`);

// Show sample
console.log(`\n📝 Muestra de contactos ULTRA limpios:`);
const sample = validContacts.slice(0, 10);

for (const contact of sample) {
    console.log(`\n👤 ${contact.nombre || '(sin nombre)'}`);
    console.log(`   📱 ${contact.telefono}`);
    if (contact.nota) {
        console.log(`   📝 ${contact.nota}`);
    }
}