#!/usr/bin/env python3
import json
import re

# Diccionario completo de correcciones específicas
CORRECCIONES_ESPECIFICAS = {
    # Doble A al inicio
    "Aadam": "Adam",
    "Aaishaqvistagaard": "Aisha Vistagaard",
    
    # A pegada que debe quitarse + nombres pegados
    "Aalbertopos": "Alberto Pos",
    "Aalexandra": "Alexandra",
    "Aandrearivera": "Andrea Rivera",
    "Aandres": "Andrés",
    "Aandresidagarra": "Andrés Idagarra", 
    "Aandrés": "Andrés",
    "Aangelmartínez": "Ángel Martínez",
    "Aangie": "Angie",
    "Aanniechaljub": "Annie Chaljub",
    "Aanyelarivera": "Anyela Rivera",
    "Aastridvelasquez": "Astrid Velásquez",
    
    # Nombres con A pegada + apellido
    "Acesarmontoya": "César Montoya",
    "Acarlos": "Carlos",
    "Acarloslopez": "Carlos López",
    "Acarlossegura": "Carlos Segura",
    "Acarolina": "Carolina",
    "Acarolinapinilla": "Carolina Pinilla",
    "Acarolinarojas": "Carolina Rojas",
    "Acarolquiroga": "Carol Quiroga",
    "Acindyflórez": "Cindy Flórez",
    "Aclaudia": "Claudia",
    "Aclaudiabarca": "Claudia Barca",
    "Aclaudiaprieto": "Claudia Prieto",
    
    # Más nombres con A pegada
    "Adanielaciro": "Daniela Ciro",
    "Adaisymendoza": "Daisy Mendoza",
    "Adamiánbarragán": "Damián Barragán",
    "Adanorahija": "Danora Hija",
    "Adiana": "Diana",
    "Adianagallardo": "Diana Gallardo",
    "Abdanielfino": "Daniel Fino",
    "Abelénchiraquian": "Belén Chiraquian",
    "Aberthaaguilar": "Bertha Aguilar",
    "Abrkatherinposible": "Katherine Posible",
    
    # Nombres pegados sin A
    "Acamiloandres": "Camilo Andrés",
    "Alexandervasquez": "Alexander Vásquez",
    "Alexanderabril": "Alexander Abril",
    "Julioguecha": "Julio Guecha",
    "Juliokippsy": "Julio Kippsy",
    "Melissamayo": "Melissa Mayo",
    "Posiblecamilomayorga": "Camilo Mayorga",
    
    # Casos especiales que NO deben cambiar
    "Abad": "Abad",
    "Abel": "Abel", 
    "Abraham": "Abraham",
    "Abril": "Abril",
    "Ada": "Ada",
    "Adam": "Adam",
    "Adriana": "Adriana",
    "Adrián": "Adrián",
    "Agustín": "Agustín",
    "Aida": "Aida",
    "Alan": "Alan",
    "Alba": "Alba",
    "Alberto": "Alberto",
    "Alejandra": "Alejandra",
    "Alejandro": "Alejandro",
    "Alex": "Alex",
    "Alexandra": "Alexandra",
    "Alfonso": "Alfonso",
    "Alfredo": "Alfredo",
    "Alicia": "Alicia",
    "Álvaro": "Álvaro",
    "Amanda": "Amanda",
    "Amelia": "Amelia",
    "Ana": "Ana",
    "Andrea": "Andrea",
    "Andrés": "Andrés",
    "Ángel": "Ángel",
    "Ángela": "Ángela",
    "Angie": "Angie",
    "Antonio": "Antonio",
}

def limpiar_nombre_preciso(nombre):
    """Limpia el nombre de forma precisa usando el diccionario"""
    
    if not nombre:
        return None
        
    # Primero buscar en el diccionario de correcciones
    if nombre in CORRECCIONES_ESPECIFICAS:
        return CORRECCIONES_ESPECIFICAS[nombre]
    
    # Si no está en el diccionario, intentar detectar patrones genéricos
    nombre_procesado = nombre
    
    # Detectar nombres pegados por CamelCase (minúscula seguida de mayúscula)
    # Pero solo si no tiene espacios ya
    if ' ' not in nombre_procesado and re.search(r'[a-z][A-Z]', nombre_procesado):
        # Separar en los cambios de mayúscula
        nombre_procesado = re.sub(r'([a-z])([A-Z])', r'\1 \2', nombre_procesado)
    
    # Detectar algunos apellidos comunes pegados
    apellidos_comunes = [
        'garcia', 'rodriguez', 'martinez', 'lopez', 'gonzalez', 
        'hernandez', 'perez', 'sanchez', 'ramirez', 'torres',
        'flores', 'rivera', 'gomez', 'diaz', 'reyes', 'morales',
        'jimenez', 'ruiz', 'alvarez', 'castillo', 'romero'
    ]
    
    for apellido in apellidos_comunes:
        # Si termina con un apellido común sin espacio antes
        patron = f'([a-z])({apellido})$'
        if re.search(patron, nombre_procesado.lower()):
            nombre_procesado = re.sub(patron, r'\1 \2', nombre_procesado, flags=re.IGNORECASE)
            break
    
    # Capitalizar correctamente
    if nombre_procesado != nombre:  # Solo si hicimos cambios
        palabras = nombre_procesado.split()
        palabras_capitalizadas = []
        palabras_minusculas = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'da']
        
        for i, palabra in enumerate(palabras):
            if i == 0 or palabra.lower() not in palabras_minusculas:
                palabras_capitalizadas.append(palabra.capitalize())
            else:
                palabras_capitalizadas.append(palabra.lower())
        
        nombre_procesado = ' '.join(palabras_capitalizadas)
    
    return nombre_procesado

# Cargar contactos
print("📖 Leyendo archivo CONTACTOS_DEFINITIVOS.json...")
with open('/workspace/CONTACTOS_DEFINITIVOS.json', 'r') as f:
    contactos = json.load(f)

print(f"📊 Total de contactos: {len(contactos)}")

# Procesar cada contacto
contactos_finales = []
cambios = []

for contacto in contactos:
    nombre_original = contacto.get('nombre', '')
    nombre_limpio = limpiar_nombre_preciso(nombre_original)
    
    if nombre_limpio and nombre_limpio != nombre_original:
        cambios.append({
            'original': nombre_original,
            'limpio': nombre_limpio
        })
    
    if nombre_limpio:
        contactos_finales.append({
            'nombre': nombre_limpio,
            'telefono': contacto['telefono'],
            'nota': contacto.get('nota')
        })

# Ordenar alfabéticamente
contactos_finales.sort(key=lambda x: (x['nombre'] or '').lower())

print(f"\n✅ Contactos procesados: {len(contactos_finales)}")
print(f"🔄 Nombres corregidos: {len(cambios)}")

# Guardar archivos finales
with open('/workspace/CONTACTOS_100_LIMPIOS.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_finales, f, indent=2, ensure_ascii=False)

with open('/workspace/MUESTRA_50_PERFECTOS.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_finales[:50], f, indent=2, ensure_ascii=False)

print("\n📁 ARCHIVOS FINALES GUARDADOS:")
print("   ✅ /workspace/CONTACTOS_100_LIMPIOS.json")
print("   ✅ /workspace/MUESTRA_50_PERFECTOS.json")

# Mostrar ejemplos
print("\n🔍 EJEMPLOS DE CORRECCIONES:")
print("="*80)
for i, cambio in enumerate(cambios[:15], 1):
    print(f"{i:2}. \"{cambio['original']}\" → \"{cambio['limpio']}\"")

# Buscar específicamente el caso de César Montoya
print("\n🔎 VERIFICACIÓN DE CASOS ESPECÍFICOS:")
print("="*80)
casos_verificar = ["Acesarmontoya", "Acarloslopez", "Aangie", "Aadam"]
for caso in casos_verificar:
    for c in contactos_finales:
        if caso.lower() in (c.get('nombre', '').lower() if c.get('nombre') else ''):
            print(f"Encontrado: {c['nombre']} (Tel: {c['telefono'][:10]}...)")
            break

# Mostrar muestra final
print("\n🎯 PRIMEROS 30 CONTACTOS FINALES:")
print("="*80)
for i, c in enumerate(contactos_finales[:30], 1):
    print(f"{i:2}. {c['nombre']:<40} | {c['telefono']}")
    if c.get('nota'):
        print(f"    Nota: {c['nota']}")