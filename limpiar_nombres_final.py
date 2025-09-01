#!/usr/bin/env python3
import json
import re

# Leer el archivo
with open('/workspace/contactos_ultra_limpios.json', 'r') as f:
    contactos = json.load(f)

def limpiar_nombre(nombre):
    if not nombre:
        return None
    
    original = nombre
    
    # Remover TODOS los números del principio, sin importar el formato
    # Esto es MUY agresivo pero necesario
    while nombre and nombre[0].isdigit():
        # Encontrar donde terminan los números/códigos
        i = 0
        while i < len(nombre) and (nombre[i].isdigit() or nombre[i] in ' -/'):
            i += 1
        nombre = nombre[i:].strip()
    
    # Ahora remover patrones específicos que puedan quedar
    # Remover fechas con mes
    nombre = re.sub(r'^(?:de\s+)?(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:\d{2,4})?', '', nombre, flags=re.IGNORECASE)
    
    # Remover letras sueltas al inicio (como "B", "A")
    nombre = re.sub(r'^[A-Z]\s+', '', nombre)
    
    # Remover guiones y caracteres especiales al inicio
    nombre = re.sub(r'^[-\s,\.]+', '', nombre)
    
    # Limpiar espacios múltiples
    nombre = re.sub(r'\s+', ' ', nombre).strip()
    
    # Si el nombre quedó vacío o muy corto, retornar None
    if not nombre or len(nombre) < 2:
        return None
    
    # Si el nombre es solo números, retornar None
    if nombre.isdigit():
        return None
    
    # Capitalizar correctamente
    palabras = nombre.split()
    palabras_capitalizadas = []
    palabras_minusculas = ['de', 'del', 'la', 'el', 'los', 'las', 'y']
    
    for i, palabra in enumerate(palabras):
        if i == 0 or palabra.lower() not in palabras_minusculas:
            palabras_capitalizadas.append(palabra.capitalize())
        else:
            palabras_capitalizadas.append(palabra.lower())
    
    return ' '.join(palabras_capitalizadas)

def procesar_nota(nota, nombre_original):
    if not nota:
        nota = ""
    
    # Extraer fecha del nombre original si existe
    fecha_match = re.search(r'\d{1,2}[\s/]\d{1,2}[\s/]\d{2,4}', nombre_original or '')
    if not fecha_match:
        fecha_match = re.search(r'\d{1,2}\s+de\s+\w+\s+de\s+\d{4}', nombre_original or '')
    
    if fecha_match and fecha_match.group() not in nota:
        fecha = fecha_match.group()
        nota = f"{fecha} - {nota}" if nota else fecha
    
    # Limpiar la nota
    nota = re.sub(r'\s*-\s*-\s*', ' - ', nota)
    nota = nota.strip(' -')
    
    return nota if nota else None

# Procesar todos los contactos
contactos_limpios = []
for contacto in contactos:
    nombre_limpio = limpiar_nombre(contacto.get('nombre'))
    
    if nombre_limpio:
        nota_procesada = procesar_nota(contacto.get('nota'), contacto.get('nombre'))
        
        contactos_limpios.append({
            'nombre': nombre_limpio,
            'telefono': contacto['telefono'],
            'nota': nota_procesada
        })

# Ordenar por nombre
contactos_limpios.sort(key=lambda x: x['nombre'])

print(f"✅ Procesados {len(contactos_limpios)} contactos con nombres limpios")
print(f"📝 Con notas: {len([c for c in contactos_limpios if c['nota']])}")

# Guardar archivos finales
with open('/workspace/contactos_definitivos.json', 'w') as f:
    json.dump(contactos_limpios, f, indent=2, ensure_ascii=False)

with open('/workspace/muestra_50_definitivos.json', 'w') as f:
    json.dump(contactos_limpios[:50], f, indent=2, ensure_ascii=False)

print("\n📄 Archivos guardados:")
print("   - /workspace/contactos_definitivos.json")
print("   - /workspace/muestra_50_definitivos.json")

# Mostrar muestra
print("\n🎯 Primeros 10 contactos DEFINITIVOS:")
for i, c in enumerate(contactos_limpios[:10], 1):
    print(f"\n{i}. {c['nombre']}")
    print(f"   📱 {c['telefono']}")
    if c['nota']:
        print(f"   📝 {c['nota']}")