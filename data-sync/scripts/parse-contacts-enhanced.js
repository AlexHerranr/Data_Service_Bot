import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keywords to exclude non-tourism related contacts
const EXCLUDE_KEYWORDS = [
    'abogado', 'abogada', 'juridico', 'juridica',
    'cobranza', 'cobro', 'deuda', 'embargo',
    'policia', 'fiscal', 'juzgado', 'notaria',
    'banco', 'financiera', 'prestamo', 'credito',
    'demanda', 'denuncia', 'libertador',
    'acuerdo de pago', 'acuerdo pago',
    'servicio tecnico', 'tecnico',
    'delivery', 'domicilio', 'mensajeria',
    'taxi', 'uber', 'indriver',
    'plomero', 'electricista', 'cerrajero',
    'medico', 'doctor', 'clinica', 'hospital',
    'farmacia', 'drogueria'
];

// Keywords that indicate tourism/booking relevance
const TOURISM_KEYWORDS = [
    'reserva', 'booking', 'huesped', 'cliente',
    'apartamento', 'apto', 'apt', 'habitacion',
    'check', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
    'grupo', 'familia', 'pareja', 'amigos',
    'tour', 'turismo', 'vacaciones', 'viaje',
    'airbnb', 'booking.com', 'expedia'
];

// Read and parse the raw contact data
function parseVCard(data) {
    const contacts = [];
    const lines = data.split('\n');
    
    let currentContact = {};
    let inVCard = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Start of vCard
        if (line === 'BEGIN:VCARD') {
            inVCard = true;
            currentContact = {};
            continue;
        }
        
        // End of vCard
        if (line === 'END:VCARD') {
            inVCard = false;
            if (currentContact.phone) {
                // Build the note/reference from available data
                const noteParts = [];
                
                if (currentContact.org) noteParts.push(currentContact.org);
                if (currentContact.title) noteParts.push(currentContact.title);
                if (currentContact.note) noteParts.push(currentContact.note);
                if (currentContact.address) noteParts.push(currentContact.address);
                
                currentContact.nota = noteParts.join(' - ').trim() || null;
                
                // Clean up the contact object
                delete currentContact.org;
                delete currentContact.title;
                delete currentContact.note;
                delete currentContact.address;
                
                contacts.push(currentContact);
            }
            currentContact = {};
            continue;
        }
        
        // Parse vCard fields
        if (inVCard) {
            if (line.startsWith('FN:')) {
                currentContact.nombre = cleanName(line.substring(3).trim());
            } else if (line.startsWith('N:')) {
                // N: format is LastName;FirstName;MiddleName;Prefix;Suffix
                const nameParts = line.substring(2).split(';');
                const fullName = nameParts.filter(p => p && p.trim()).join(' ');
                if (!currentContact.nombre && fullName) {
                    currentContact.nombre = cleanName(fullName);
                }
            } else if (line.startsWith('TEL')) {
                const phoneMatch = line.match(/TEL[^:]*:(.+)/);
                if (phoneMatch) {
                    const phone = normalizePhone(phoneMatch[1].trim());
                    if (isValidMobileNumber(phone)) {
                        currentContact.telefono = phone;
                        currentContact.phone = phone; // Keep for processing
                    }
                }
            } else if (line.startsWith('CELL:')) {
                const phone = normalizePhone(line.substring(5).trim());
                if (isValidMobileNumber(phone)) {
                    currentContact.telefono = phone;
                    currentContact.phone = phone;
                }
            } else if (line.startsWith('ORG:')) {
                currentContact.org = line.substring(4).trim();
            } else if (line.startsWith('TITLE:')) {
                currentContact.title = line.substring(6).trim();
            } else if (line.startsWith('NOTE:')) {
                // Notes often contain booking references
                currentContact.note = line.substring(5).trim();
            } else if (line.startsWith('ADR:')) {
                // Address might contain apartment references
                const addr = line.substring(4).replace(/;/g, ' ').trim();
                if (addr && addr !== ';;;;;;') {
                    currentContact.address = addr;
                }
            }
        }
        
        // Handle standalone phone numbers (not in vCard)
        if (!inVCard && line && !line.startsWith('BEGIN:') && !line.startsWith('VERSION:')) {
            const phone = extractPhoneFromLine(line);
            if (phone) {
                contacts.push({
                    nombre: null,
                    telefono: phone,
                    nota: null,
                    phone: phone
                });
            }
        }
    }
    
    return contacts;
}

function extractPhoneFromLine(line) {
    // Try different patterns
    if (line.startsWith('TEL:') || line.startsWith('CELL:')) {
        const phone = line.replace(/^(TEL:|CELL:)/, '').trim();
        const normalized = normalizePhone(phone);
        if (isValidMobileNumber(normalized)) {
            return normalized;
        }
    }
    
    // Check if line is just a phone number
    const cleaned = line.replace(/[^\d+]/g, '');
    if (cleaned.length >= 10) {
        const normalized = normalizePhone(cleaned);
        if (isValidMobileNumber(normalized)) {
            return normalized;
        }
    }
    
    return null;
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
    
    // Remove special characters but keep accents
    name = name.replace(/[^\w\s\-'áéíóúñÁÉÍÓÚÑ.,]/gi, ' ');
    
    // Remove apartment/room references
    name = name.replace(/\b(apt?o?|habitaci[oó]n|hab|cuarto|room)\s*\d+\b/gi, '');
    
    // Remove dates at the end
    name = name.replace(/\s*-?\s*\d{1,2}\s*(de\s*)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/gi, '');
    
    // Clean multiple spaces
    name = name.replace(/\s+/g, ' ').trim();
    
    // Skip if too short or just numbers
    if (name.length < 2 || /^\d+$/.test(name)) {
        return '';
    }
    
    return name;
}

function shouldExcludeContact(contact) {
    const checkText = `${contact.nombre || ''} ${contact.nota || ''}`.toLowerCase();
    
    // Exclude if contains excluded keywords
    for (const keyword of EXCLUDE_KEYWORDS) {
        if (checkText.includes(keyword)) {
            return true;
        }
    }
    
    // Exclude if no name and no tourism-related note
    if (!contact.nombre) {
        let hasTourismKeyword = false;
        for (const keyword of TOURISM_KEYWORDS) {
            if (checkText.includes(keyword)) {
                hasTourismKeyword = true;
                break;
            }
        }
        if (!hasTourismKeyword) {
            return true;
        }
    }
    
    return false;
}

function extractBookingReference(text) {
    if (!text) return null;
    
    const references = [];
    
    // Extract dates
    const datePattern = /\b(\d{1,2})\s*(de\s*)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/gi;
    const dates = text.match(datePattern);
    if (dates) {
        references.push(...dates);
    }
    
    // Extract apartment/room references
    const aptPattern = /\b(apt?o?|habitaci[oó]n|room|suite|villa)\s*[a-z0-9]+\b/gi;
    const apts = text.match(aptPattern);
    if (apts) {
        references.push(...apts);
    }
    
    // Extract booking platforms
    const platformPattern = /\b(airbnb|booking\.com|expedia|despegar|hotels\.com)\b/gi;
    const platforms = text.match(platformPattern);
    if (platforms) {
        references.push(...platforms);
    }
    
    // Extract group references
    const groupPattern = /\b(grupo|familia|pareja)\s+\w+/gi;
    const groups = text.match(groupPattern);
    if (groups) {
        references.push(...groups);
    }
    
    return references.length > 0 ? references.join(', ') : null;
}

// Main execution
console.log('🚀 Procesando contactos con extracción mejorada...');
console.log('=' .repeat(60));

const rawFilePath = path.join(__dirname, '../raw-contacts-full.txt');
const fileStats = fs.statSync(rawFilePath);
console.log(`📂 Archivo: ${path.basename(rawFilePath)}`);
console.log(`📊 Tamaño: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

const rawData = fs.readFileSync(rawFilePath, 'utf-8');
const contacts = parseVCard(rawData);

console.log(`\n📖 Contactos parseados: ${contacts.length}`);

// Filter and clean contacts
const validContacts = [];
const seenPhones = new Set();
let excluded = 0;
let duplicates = 0;
let noName = 0;

for (const contact of contacts) {
    // Skip duplicates
    if (seenPhones.has(contact.telefono)) {
        duplicates++;
        continue;
    }
    
    // Skip if should be excluded
    if (shouldExcludeContact(contact)) {
        excluded++;
        continue;
    }
    
    // Extract booking reference if available
    const bookingRef = extractBookingReference(`${contact.nombre || ''} ${contact.nota || ''}`);
    if (bookingRef && !contact.nota) {
        contact.nota = bookingRef;
    }
    
    // Count contacts without names
    if (!contact.nombre) {
        noName++;
    }
    
    // Remove the temporary phone field
    delete contact.phone;
    
    seenPhones.add(contact.telefono);
    validContacts.push(contact);
}

// Sort by whether they have names (with names first)
validContacts.sort((a, b) => {
    if (a.nombre && !b.nombre) return -1;
    if (!a.nombre && b.nombre) return 1;
    return 0;
});

console.log(`\n📊 Resultados del filtrado:`);
console.log(`✅ Contactos válidos: ${validContacts.length}`);
console.log(`❌ Excluidos (no relevantes): ${excluded}`);
console.log(`🔄 Duplicados removidos: ${duplicates}`);
console.log(`👤 Con nombre: ${validContacts.filter(c => c.nombre).length}`);
console.log(`❓ Sin nombre: ${noName}`);

// Save to JSON
const outputPath = path.join(__dirname, '../contactos-limpios.json');
fs.writeFileSync(outputPath, JSON.stringify(validContacts, null, 2));

// Create a sample for review
const sample = validContacts.slice(0, 50);
const samplePath = path.join(__dirname, '../contactos-muestra.json');
fs.writeFileSync(samplePath, JSON.stringify(sample, null, 2));

console.log(`\n✅ Archivos generados:`);
console.log(`   📄 ${outputPath}`);
console.log(`   📄 ${samplePath} (primeros 50 para revisión)`);

// Show statistics by country
const byCountry = {};
for (const contact of validContacts) {
    const prefix = contact.telefono.substring(0, 4);
    byCountry[prefix] = (byCountry[prefix] || 0) + 1;
}

console.log(`\n🌍 Distribución por país:`);
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
        'Otro';
    console.log(`   ${countryName} (${prefix}): ${count} contactos`);
}

// Show sample of contacts with booking references
console.log(`\n📝 Muestra de contactos con referencias de reserva:`);
const withRefs = validContacts.filter(c => c.nota).slice(0, 5);
console.table(withRefs);