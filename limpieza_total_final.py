#!/usr/bin/env python3
import json
import re

# Mapeo de meses
MESES = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
    '1': 'Enero', '2': 'Febrero', '3': 'Marzo', '4': 'Abril',
    '5': 'Mayo', '6': 'Junio', '7': 'Julio', '8': 'Agosto',
    '9': 'Septiembre'
}

def limpiar_contacto(contacto):
    """Limpia completamente un contacto"""
    nombre_original = contacto.get('nombre', '')
    nota_original = contacto.get('nota', '')
    
    if not nombre_original:
        return None
    
    nombre = nombre_original
    notas_extra = []
    
    # Patrón 1: "03 04 2025erika Natalia Sotelo" -> fecha DD MM YYYY pegada al nombre
    match = re.match(r'^(\d{1,2})\s+(\d{1,2})\s+(\d{4})(.+)$', nombre)
    if match:
        dia = match.group(1)
        mes = match.group(2)
        año = match.group(3)
        nombre = match.group(4).strip()
        
        # Convertir mes a nombre
        mes_nombre = MESES.get(mes.lstrip('0'), mes)
        notas_extra.append(f"{mes_nombre} {año}")
    
    # Patrón 2: "01 07 2025yeifer David Sanchez Diaz" -> sin espacio entre año y nombre
    if not match:
        match = re.match(r'^(\d{1,2})\s+(\d{1,2})\s+(\d{4})([a-zA-Z].*)$', nombre)
        if match:
            dia = match.group(1)
            mes = match.group(2)
            año = match.group(3)
            nombre = match.group(4).strip()
            
            mes_nombre = MESES.get(mes.lstrip('0'), mes)
            notas_extra.append(f"{mes_nombre} {año}")
    
    # Patrón 3: "1 Jul 2025alejandro Paiva" -> fecha con mes en texto
    if not match:
        match = re.match(r'^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})(.+)$', nombre)
        if match:
            dia = match.group(1)
            mes_texto = match.group(2)
            año = match.group(3)
            nombre = match.group(4).strip()
            notas_extra.append(f"{mes_texto} {año}")
    
    # Patrón 4: "2024carolina Giraldo" -> año pegado al nombre
    if not match:
        match = re.match(r'^(\d{4})([a-zA-Z].+)$', nombre)
        if match:
            año = match.group(1)
            nombre = match.group(2).strip()
            notas_extra.append(año)
    
    # Patrón 5: "21adriana Torres" -> código corto (año abreviado)
    if not match:
        match = re.match(r'^(\d{2})([a-zA-Z].+)$', nombre)
        if match:
            codigo = match.group(1)
            nombre = match.group(2).strip()
            # Si es 20-29, probablemente es 2020-2029
            if int(codigo) >= 20 and int(codigo) <= 29:
                notas_extra.append(f"20{codigo}")
    
    # Patrón 6: Números sueltos al inicio
    nombre = re.sub(r'^\d+\s*', '', nombre)
    
    # Limpiar el nombre de caracteres especiales al inicio
    nombre = re.sub(r'^[-\.,\s]+', '', nombre)
    
    # Capitalizar correctamente
    if nombre:
        palabras = nombre.lower().split()
        palabras_minusculas = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'da']
        resultado = []
        
        for i, palabra in enumerate(palabras):
            if i == 0 or palabra not in palabras_minusculas:
                resultado.append(palabra.capitalize())
            else:
                resultado.append(palabra)
        
        nombre = ' '.join(resultado)
    
    # Construir la nota final
    nota_final = nota_original if nota_original else ""
    
    # Agregar información de fecha a la nota
    if notas_extra:
        fecha_info = notas_extra[0]
        if nota_final:
            # Si la nota ya tiene "Reservó Apt XXX", agregar la fecha
            if "Reservó Apt" in nota_final:
                nota_final = f"{nota_final} en {fecha_info}"
            else:
                nota_final = f"{fecha_info} - {nota_final}"
        else:
            nota_final = fecha_info
    
    # Limpiar la nota
    nota_final = re.sub(r'\s+', ' ', nota_final).strip()
    nota_final = re.sub(r'\s*-\s*-\s*', ' - ', nota_final)
    
    # Validar que el nombre no esté vacío
    if not nombre or len(nombre) < 2:
        return None
    
    return {
        'nombre': nombre,
        'telefono': contacto['telefono'],
        'nota': nota_final if nota_final else None
    }

# Leer el archivo original
print("📖 Leyendo archivo original...")
with open('/workspace/CONTACTOS_LIMPIOS_FINAL.json', 'r') as f:
    contactos = json.load(f)

print(f"📊 Total de contactos a procesar: {len(contactos)}")

# Procesar por lotes
contactos_limpios = []
batch_size = 500
total_batches = (len(contactos) + batch_size - 1) // batch_size

for batch_num in range(total_batches):
    start_idx = batch_num * batch_size
    end_idx = min((batch_num + 1) * batch_size, len(contactos))
    
    print(f"\n🔄 Procesando lote {batch_num + 1}/{total_batches} (contactos {start_idx + 1} a {end_idx})...")
    
    batch = contactos[start_idx:end_idx]
    
    for contacto in batch:
        limpio = limpiar_contacto(contacto)
        if limpio:
            contactos_limpios.append(limpio)
    
    print(f"   ✅ Lote procesado: {len([c for c in batch if limpiar_contacto(c)])} contactos válidos")

# Ordenar alfabéticamente
contactos_limpios.sort(key=lambda x: x['nombre'].lower())

print(f"\n📊 RESUMEN FINAL:")
print(f"   • Total procesados: {len(contactos)}")
print(f"   • Contactos válidos: {len(contactos_limpios)}")
print(f"   • Con notas: {len([c for c in contactos_limpios if c['nota']])}")

# Guardar archivos
with open('/workspace/CONTACTOS_DEFINITIVOS.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_limpios, f, indent=2, ensure_ascii=False)

with open('/workspace/MUESTRA_50_DEFINITIVOS.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_limpios[:50], f, indent=2, ensure_ascii=False)

print("\n✅ Archivos guardados:")
print("   • /workspace/CONTACTOS_DEFINITIVOS.json")
print("   • /workspace/MUESTRA_50_DEFINITIVOS.json")

print("\n🎯 MUESTRA DE LOS PRIMEROS 20 CONTACTOS:")
print("=" * 70)

for i, contacto in enumerate(contactos_limpios[:20], 1):
    print(f"\n{i:2}. Nombre: {contacto['nombre']}")
    print(f"    Tel: {contacto['telefono']}")
    if contacto['nota']:
        print(f"    Nota: {contacto['nota']}")