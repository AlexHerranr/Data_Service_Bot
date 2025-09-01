#!/usr/bin/env python3
import json
import re

def separar_nombre_pegado(nombre):
    """Separa nombres que están pegados y corrige capitalización"""
    
    if not nombre:
        return None
    
    # Lista de nombres que empiezan con A y son válidos (no remover la A)
    nombres_validos_con_a = [
        'Abad', 'Abel', 'Abraham', 'Abril', 'Ada', 'Adam', 'Adán', 'Adriana', 
        'Adrián', 'Agustín', 'Agustina', 'Aida', 'Alan', 'Alba', 'Alberto',
        'Alejandra', 'Alejandro', 'Alex', 'Alexandra', 'Alexis', 'Alfonso',
        'Alfredo', 'Alicia', 'Alonso', 'Álvaro', 'Amanda', 'Amelia', 'Ana',
        'Andrés', 'Andrea', 'Ángel', 'Ángela', 'Angie', 'Antonio', 'Antonia'
    ]
    
    # Verificar si es un nombre válido que empieza con A
    es_nombre_valido = False
    for nombre_valido in nombres_validos_con_a:
        if nombre.lower().startswith(nombre_valido.lower()):
            es_nombre_valido = True
            break
    
    # Solo remover la A si claramente es un prefijo erróneo
    # Patrón: "Acesarmontoya" donde después de A hay minúscula y no es un nombre válido
    if not es_nombre_valido and len(nombre) > 2 and nombre[0] == 'A' and nombre[1].islower():
        # Verificar si quitando la A queda un nombre que tiene sentido
        sin_a = nombre[1:]
        if sin_a[0].lower() in 'bcdfghjklmnpqrstvwxyz':  # Consonantes comunes al inicio de nombres
            nombre = sin_a
    
    # Remover números al principio
    nombre = re.sub(r'^\d+', '', nombre).strip()
    
    # Separar palabras pegadas usando cambios de mayúsculas/minúsculas
    # Ejemplo: "cesarmontoya" o "CesarMontoya"
    resultado = []
    palabra_actual = []
    
    for i, char in enumerate(nombre):
        if i == 0:
            palabra_actual.append(char.upper())
        elif char.isupper() and i > 0:
            # Nueva palabra empieza con mayúscula
            if palabra_actual:
                resultado.append(''.join(palabra_actual))
            palabra_actual = [char]
        else:
            palabra_actual.append(char)
    
    if palabra_actual:
        resultado.append(''.join(palabra_actual))
    
    # Unir las palabras
    nombre_separado = ' '.join(resultado)
    
    # Casos especiales de nombres pegados comunes
    patrones_comunes = [
        (r'^([A-Z][a-z]+)([a-z]{2,})$', r'\1 \2'),  # "Cesarmontoya" -> "Cesar montoya"
        (r'^([a-z]+)([A-Z][a-z]+)$', r'\1 \2'),      # "cesarMontoya" -> "cesar Montoya"
    ]
    
    for patron, reemplazo in patrones_comunes:
        if re.match(patron, nombre):
            nombre_separado = re.sub(patron, reemplazo, nombre)
            break
    
    # Capitalizar correctamente
    palabras = nombre_separado.split()
    palabras_capitalizadas = []
    palabras_minusculas = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'da']
    
    for i, palabra in enumerate(palabras):
        if i == 0 or palabra.lower() not in palabras_minusculas:
            palabras_capitalizadas.append(palabra.capitalize())
        else:
            palabras_capitalizadas.append(palabra.lower())
    
    return ' '.join(palabras_capitalizadas)

def detectar_nombres_pegados(texto):
    """Detecta si un texto tiene nombres pegados"""
    
    # Patrones que indican nombres pegados:
    # 1. Todo en minúsculas sin espacios pero con más de 10 caracteres
    if texto and len(texto) > 10 and texto.islower() and ' ' not in texto:
        return True
    
    # 2. Patrón camelCase (minúscula seguida de mayúscula)
    if re.search(r'[a-z][A-Z]', texto):
        return True
    
    # 3. Empieza con A mayúscula seguida de minúscula (nuestro problema específico)
    if texto and len(texto) > 2 and texto[0] == 'A' and texto[1].islower():
        return True
    
    # 4. Nombres muy largos sin espacios
    if texto and len(texto) > 15 and ' ' not in texto:
        return True
    
    return False

# Diccionario de correcciones manuales para casos conocidos
CORRECCIONES_MANUALES = {
    # Nombres con A pegada que debe removerse
    "Acesarmontoya": "César Montoya",
    "Aalexandra": "Alexandra",
    "Aangie": "Angie",
    "Aandres": "Andrés",
    "Aandrés": "Andrés",
    "Acarlos": "Carlos",
    "Acarolina": "Carolina",
    "Acindyflórez": "Cindy Flórez",
    "Aclaudia": "Claudia",
    "Adanielaciro": "Daniela Ciro",
    "Adiana": "Diana",
    "Aalbertopos": "Alberto Pos",
    "Aandrearivera": "Andrea Rivera",
    "Aandresidagarra": "Andrés Idagarra",
    "Aangelmartínez": "Ángel Martínez",
    "Aanniechaljub": "Annie Chaljub",
    "Aanyelarivera": "Anyela Rivera",
    "Aastridvelasquez": "Astrid Velásquez",
    "Abdanielfino": "Daniel Fino",
    "Abelénchiraquian": "Belén Chiraquian",
    "Aberthaaguilar": "Bertha Aguilar",
    "Abrkatherinposible": "Katherine Posible",
    "Acamiloandres": "Camilo Andrés",
    "Acarloslopez": "Carlos López",
    "Acarlossegura": "Carlos Segura",
    "Acarolinapinilla": "Carolina Pinilla",
    "Acarolinarojas": "Carolina Rojas",
    "Acarolquiroga": "Carol Quiroga",
    "Adaisymendoza": "Daisy Mendoza",
    "Adamiánbarragán": "Damián Barragán",
    "Adanorahija": "Danora Hija",
    "Adianagallardo": "Diana Gallardo",
    
    # Nombres que NO deben cambiar (empiezan con A legítimamente)
    "Abad": "Abad",
    "Adam": "Adam",
    "Ada": "Ada",
    "Abril": "Abril",
    "Abraham": "Abraham",
    
    # Nombres pegados sin A
    "Alexandervasquez": "Alexander Vásquez",
    "Alexanderabril": "Alexander Abril",
    "Julioguecha": "Julio Guecha",
    "Juliokippsy": "Julio Kippsy",
    "Melissamayo": "Melissa Mayo",
    "Posiblecamilomayorga": "Camilo Mayorga",
    
    # Casos especiales con doble A
    "Aadam": "Adam",
    "Aaishaqvistagaard": "Aisha Qvistagaard",
}

# Leer el archivo
print("📖 Leyendo archivo CONTACTOS_DEFINITIVOS.json...")
with open('/workspace/CONTACTOS_DEFINITIVOS.json', 'r') as f:
    contactos = json.load(f)

print(f"📊 Total de contactos: {len(contactos)}")

# Procesar cada contacto
contactos_corregidos = []
nombres_corregidos = 0
ejemplos_correccion = []

for contacto in contactos:
    nombre_original = contacto.get('nombre', '')
    
    # Verificar si necesita corrección
    necesita_correccion = detectar_nombres_pegados(nombre_original)
    
    if necesita_correccion:
        # Primero buscar en correcciones manuales
        if nombre_original in CORRECCIONES_MANUALES:
            nombre_corregido = CORRECCIONES_MANUALES[nombre_original]
        else:
            nombre_corregido = separar_nombre_pegado(nombre_original)
        
        if nombres_corregidos < 20:  # Guardar ejemplos
            ejemplos_correccion.append({
                'original': nombre_original,
                'corregido': nombre_corregido
            })
        
        nombres_corregidos += 1
        
        contactos_corregidos.append({
            'nombre': nombre_corregido,
            'telefono': contacto['telefono'],
            'nota': contacto.get('nota')
        })
    else:
        # No necesita corrección
        contactos_corregidos.append(contacto)

# Ordenar alfabéticamente
contactos_corregidos.sort(key=lambda x: (x['nombre'] or '').lower())

print(f"\n✅ Nombres corregidos: {nombres_corregidos}")
print(f"📝 Total final: {len(contactos_corregidos)} contactos")

# Guardar archivos
with open('/workspace/CONTACTOS_FINALES_CORREGIDOS.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_corregidos, f, indent=2, ensure_ascii=False)

with open('/workspace/MUESTRA_50_FINALES.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_corregidos[:50], f, indent=2, ensure_ascii=False)

print("\n📁 Archivos guardados:")
print("   • /workspace/CONTACTOS_FINALES_CORREGIDOS.json")
print("   • /workspace/MUESTRA_50_FINALES.json")

print("\n🔍 EJEMPLOS DE CORRECCIONES:")
print("="*70)
for i, ejemplo in enumerate(ejemplos_correccion[:15], 1):
    print(f"{i:2}. Antes:   \"{ejemplo['original']}\"")
    print(f"    Después: \"{ejemplo['corregido']}\"")
    print("-"*70)

print("\n🎯 PRIMEROS 10 CONTACTOS CORREGIDOS:")
print("="*70)
for i, c in enumerate(contactos_corregidos[:10], 1):
    print(f"\n{i:2}. {c['nombre']}")
    print(f"    📱 {c['telefono']}")
    if c.get('nota'):
        print(f"    📝 {c['nota']}")