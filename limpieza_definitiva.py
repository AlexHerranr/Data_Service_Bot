#!/usr/bin/env python3
import json
import re

# Leer el archivo original
with open('/workspace/contactos_ultra_limpios.json', 'r') as f:
    contactos = json.load(f)

def extraer_nombre_limpio(texto):
    """Extrae solo el nombre real, removiendo fechas y códigos"""
    if not texto:
        return None
        
    # Buscar el primer texto que parezca un nombre real
    # Un nombre real empieza con una letra (no número)
    match = re.search(r'[a-zA-ZáéíóúñÁÉÍÓÚÑ][a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+', texto)
    
    if match:
        nombre = match.group().strip()
        
        # Remover palabras sueltas que son meses o días
        nombre = re.sub(r'\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b', '', nombre, flags=re.IGNORECASE)
        nombre = re.sub(r'\b(lun|mar|mié|jue|vie|sáb|dom|lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b', '', nombre, flags=re.IGNORECASE)
        
        # Limpiar espacios
        nombre = ' '.join(nombre.split())
        
        # Si quedó muy corto, no es válido
        if len(nombre) < 2:
            return None
            
        return nombre
    
    return None

def capitalizar_nombre(nombre):
    """Capitaliza correctamente el nombre"""
    if not nombre:
        return None
        
    palabras = nombre.lower().split()
    palabras_minusculas = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'da']
    resultado = []
    
    for i, palabra in enumerate(palabras):
        if i == 0 or palabra not in palabras_minusculas:
            resultado.append(palabra.capitalize())
        else:
            resultado.append(palabra)
    
    return ' '.join(resultado)

def extraer_info_fecha(texto):
    """Extrae información de fecha del texto original"""
    fechas = []
    
    # Buscar fechas completas (DD/MM/YYYY)
    matches = re.findall(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', texto)
    fechas.extend(matches)
    
    # Buscar fechas con mes en texto
    matches = re.findall(r'\d{1,2}\s+(?:de\s+)?(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?\d{4})?', texto, re.IGNORECASE)
    fechas.extend(matches)
    
    # Buscar años solos
    matches = re.findall(r'\b20\d{2}\b', texto)
    for year in matches:
        if year not in str(fechas):
            fechas.append(year)
    
    return ' - '.join(fechas) if fechas else None

# Procesar contactos
contactos_finales = []
estadisticas = {'procesados': 0, 'con_nombre': 0, 'sin_nombre': 0}

for contacto in contactos:
    nombre_original = contacto.get('nombre', '')
    nota_original = contacto.get('nota', '')
    
    # Extraer nombre limpio
    nombre_limpio = extraer_nombre_limpio(nombre_original)
    
    if nombre_limpio:
        nombre_limpio = capitalizar_nombre(nombre_limpio)
        
        # Extraer fecha del nombre original
        fecha_extra = extraer_info_fecha(nombre_original)
        
        # Combinar nota
        nota_final = nota_original
        if fecha_extra and fecha_extra not in (nota_original or ''):
            if nota_final:
                nota_final = f"{fecha_extra} - {nota_final}"
            else:
                nota_final = fecha_extra
        
        # Limpiar nota
        if nota_final:
            nota_final = re.sub(r'\s*-\s*-\s*', ' - ', nota_final)
            nota_final = nota_final.strip(' -')
        
        contactos_finales.append({
            'nombre': nombre_limpio,
            'telefono': contacto['telefono'],
            'nota': nota_final if nota_final else None
        })
        estadisticas['con_nombre'] += 1
    else:
        estadisticas['sin_nombre'] += 1
    
    estadisticas['procesados'] += 1

# Ordenar alfabéticamente
contactos_finales.sort(key=lambda x: x['nombre'].lower())

# Guardar archivos
with open('/workspace/CONTACTOS_LIMPIOS_FINAL.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_finales, f, indent=2, ensure_ascii=False)

# Los primeros 50 para muestra
with open('/workspace/MUESTRA_50_CONTACTOS.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_finales[:50], f, indent=2, ensure_ascii=False)

print("=" * 60)
print("✅ PROCESAMIENTO COMPLETADO")
print("=" * 60)
print(f"📊 Estadísticas:")
print(f"   • Total procesados: {estadisticas['procesados']}")
print(f"   • Con nombre válido: {estadisticas['con_nombre']}")
print(f"   • Sin nombre válido: {estadisticas['sin_nombre']}")
print(f"   • Con notas: {len([c for c in contactos_finales if c['nota']])}")
print()
print("📁 Archivos generados:")
print("   • /workspace/CONTACTOS_LIMPIOS_FINAL.json")
print("   • /workspace/MUESTRA_50_CONTACTOS.json")
print()
print("=" * 60)
print("🎯 PRIMEROS 20 CONTACTOS LIMPIOS:")
print("=" * 60)

for i, contacto in enumerate(contactos_finales[:20], 1):
    print(f"\n{i:2}. {contacto['nombre']}")
    print(f"    📱 {contacto['telefono']}")
    if contacto['nota']:
        print(f"    📝 {contacto['nota']}")