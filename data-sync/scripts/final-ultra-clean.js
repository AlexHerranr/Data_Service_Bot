import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the processed JSON
const data = JSON.parse(fs.readFileSync('/workspace/contactos_limpios_final.json', 'utf-8'));

console.log(`📖 Procesando ${data.length} contactos para limpieza final...`);

// Process each contact
const ultraClean = data.map(contact => {
    let nombre = contact.nombre || '';
    let nota = contact.nota || '';
    
    // Extract dates from the beginning of names
    // Pattern: "01 04 2025jesus Ocampo" -> "jesus Ocampo"
    const dateMatch = nombre.match(/^(\d{1,2}\s+\d{1,2}\s+\d{4})(.*)$/);
    if (dateMatch) {
        const date = dateMatch[1].replace(/\s+/g, '/');
        nombre = dateMatch[2].trim();
        if (!nota.includes(date)) {
            nota = nota ? `${date} - ${nota}` : date;
        }
    }
    
    // Pattern: "01 Julio 2024lorena" -> "lorena"
    const monthMatch = nombre.match(/^(\d{1,2}\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+\d{4})?)(.*)/i);
    if (monthMatch) {
        const dateStr = monthMatch[1];
        nombre = monthMatch[2].trim();
        if (!nota.includes(dateStr)) {
            nota = nota ? `${dateStr} - ${nota}` : dateStr;
        }
    }
    
    // Pattern: "08 Feb" at start
    const shortMonthMatch = nombre.match(/^(\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic))(.*)/i);
    if (shortMonthMatch) {
        const dateStr = shortMonthMatch[1];
        nombre = shortMonthMatch[2].trim();
        if (!nota.includes(dateStr)) {
            nota = nota ? `${dateStr} - ${nota}` : dateStr;
        }
    }
    
    // Pattern: "2024carolina" -> "carolina"
    const yearMatch = nombre.match(/^(20\d{2})([a-z].*)/i);
    if (yearMatch) {
        const year = yearMatch[1];
        nombre = yearMatch[2].trim();
        if (!nota.includes(year)) {
            nota = nota ? `${nota} en ${year}` : year;
        }
    }
    
    // Pattern: Numbers like "1820" or "1005" at the beginning
    const codeMatch = nombre.match(/^(\d{4})([a-z].*)/i);
    if (codeMatch) {
        const code = codeMatch[1];
        nombre = codeMatch[2].trim();
        const codeNum = parseInt(code);
        // If it's not a year, it's probably an apartment
        if (codeNum < 2020 || codeNum > 2029) {
            if (!nota.includes(`Apt ${code}`)) {
                nota = nota ? `${nota} - Apt ${code}` : `Apt ${code}`;
            }
        }
    }
    
    // Fix "Reservó Apt 2024" -> should be year, not apartment
    if (nota) {
        nota = nota.replace(/Reservó Apt (202[0-9])(\s|$)/g, 'en $1$2');
        nota = nota.replace(/Apt (202[0-9])(\s|$)/g, 'en $1$2');
    }
    
    // Clean up the name
    nombre = nombre.replace(/^[-\s,]+/, '');
    nombre = nombre.replace(/\s+/g, ' ').trim();
    
    // Capitalize properly
    if (nombre) {
        const lowercase = ['de', 'del', 'la', 'el', 'los', 'las', 'y'];
        nombre = nombre.split(' ')
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
    
    // Clean up nota
    if (nota) {
        nota = nota.replace(/\s+/g, ' ').trim();
        nota = nota.replace(/\s*-\s*-\s*/g, ' - ');
    }
    
    return {
        nombre: nombre || null,
        telefono: contact.telefono,
        nota: nota || null
    };
});

// Filter out contacts without names
const finalContacts = ultraClean.filter(c => c.nombre && c.nombre.length > 1);

// Sort by name quality
finalContacts.sort((a, b) => {
    // Prioritize contacts with both name and note
    if (a.nombre && a.nota && (!b.nombre || !b.nota)) return -1;
    if (b.nombre && b.nota && (!a.nombre || !a.nota)) return 1;
    
    // Alphabetically by name
    if (a.nombre && b.nombre) return a.nombre.localeCompare(b.nombre);
    
    return 0;
});

console.log(`\n📊 Resultados finales:`);
console.log(`✅ Contactos con nombres limpios: ${finalContacts.length}`);
console.log(`📝 Con notas: ${finalContacts.filter(c => c.nota).length}`);

// Save final files
fs.writeFileSync('/workspace/contactos_ultra_limpios.json', JSON.stringify(finalContacts, null, 2));
fs.writeFileSync('/workspace/muestra_50_contactos.json', JSON.stringify(finalContacts.slice(0, 50), null, 2));

console.log(`\n✅ Archivos finales guardados:`);
console.log(`   📄 /workspace/contactos_ultra_limpios.json`);
console.log(`   📄 /workspace/muestra_50_contactos.json`);

// Show sample
console.log(`\n📝 Primeros 10 contactos ULTRA limpios:`);
for (let i = 0; i < 10 && i < finalContacts.length; i++) {
    const c = finalContacts[i];
    console.log(`\n${i+1}. ${c.nombre}`);
    console.log(`   📱 ${c.telefono}`);
    if (c.nota) {
        console.log(`   📝 ${c.nota}`);
    }
}