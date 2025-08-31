#!/usr/bin/env python3
import json
import re

def limpiar_nombre_definitivo(nombre):
    """Limpia el nombre de forma definitiva"""
    
    if not nombre or len(nombre) < 2:
        return None
    
    nombre_original = nombre
    
    # PASO 1: Detectar y corregir doble A al inicio (Aadam -> Adam)
    if nombre.startswith('Aa') and len(nombre) > 2:
        # Verificar si la segunda 'a' es minúscula (indica error)
        if nombre[1] == 'a' and nombre[2].islower():
            nombre = 'A' + nombre[2:]
    
    # PASO 2: Detectar A pegada a nombres (Acesarmontoya, Acarlos, etc.)
    # Lista de nombres válidos que SÍ empiezan con A
    nombres_validos_con_a = {
        'abad', 'abel', 'abraham', 'abril', 'ada', 'adam', 'adán', 'addison',
        'adelaida', 'adela', 'adelina', 'adolfo', 'adriana', 'adrián', 'adriano',
        'agatha', 'agnes', 'agustín', 'agustina', 'aida', 'aiden', 'aileen',
        'aimee', 'aisha', 'alan', 'alana', 'alba', 'albert', 'alberta', 'alberto',
        'aldo', 'alejandra', 'alejandro', 'alejo', 'alessandra', 'alessandro',
        'alex', 'alexa', 'alexander', 'alexandra', 'alexis', 'alfonso', 'alfred',
        'alfredo', 'alice', 'alicia', 'alina', 'alison', 'allan', 'allen',
        'allison', 'alma', 'alonso', 'altagracia', 'alvaro', 'álvaro', 'alyssa',
        'amada', 'amalia', 'amanda', 'amaya', 'amber', 'amelia', 'america',
        'amira', 'amparo', 'amy', 'ana', 'anabel', 'anastasia', 'andrea',
        'andrés', 'andrew', 'andy', 'ángel', 'angela', 'ángela', 'angélica',
        'angelina', 'angelo', 'angie', 'aníbal', 'anita', 'anna', 'anne',
        'annie', 'anthony', 'antonia', 'antonio', 'antony', 'anuar', 'anyela',
        'abril', 'apollo', 'aquiles', 'arabella', 'araceli', 'aracely', 'aranza',
        'arcadio', 'ariadna', 'ariana', 'ariel', 'ariela', 'arlene', 'arleth',
        'armando', 'arnaldo', 'arnold', 'arnulfo', 'arquímedes', 'arsenio',
        'artemio', 'arthur', 'arturo', 'ashley', 'astrid', 'asunción', 'atanasio',
        'athena', 'aubrey', 'audrey', 'augusto', 'aurelia', 'aurelio', 'aurora',
        'austin', 'ava', 'avelino', 'avery', 'axel', 'ayla', 'azucena', 'azul'
    }
    
    # Si empieza con A seguida de minúscula
    if len(nombre) > 2 and nombre[0] == 'A' and nombre[1].islower():
        # Verificar si es un nombre válido con A
        nombre_lower = nombre.lower()
        es_valido = False
        
        for nombre_valido in nombres_validos_con_a:
            if nombre_lower.startswith(nombre_valido):
                es_valido = True
                break
        
        # Si no es válido, probablemente la A está pegada
        if not es_valido:
            # Quitar la A y ver qué queda
            sin_a = nombre[1:]
            # Si lo que queda parece un nombre (empieza con consonante común)
            if sin_a[0].lower() in 'bcdfghjklmnpqrstvwxyz':
                nombre = sin_a
    
    # PASO 3: Separar nombres pegados (cesarmontoya -> Cesar Montoya)
    # Detectar CamelCase
    if re.search(r'[a-z][A-Z]', nombre):
        # Separar en los cambios de mayúscula
        nombre = re.sub(r'([a-z])([A-Z])', r'\1 \2', nombre)
    
    # Detectar nombres comunes pegados
    patrones_separacion = [
        # Nombres comunes pegados
        (r'^([A-Z][a-z]+)(garcia|rodriguez|martinez|lopez|gonzalez|hernandez|perez|sanchez|ramirez|torres|flores|rivera|gomez|diaz|reyes|morales|jimenez|ruiz|alvarez|castillo|romero|mendoza|cruz|ortiz|gutierrez|chavez|ramos|vargas|vasquez|castro|coronado|correa|rojas|mendez|fuentes|aguilar|salazar|luna|ortega|guerrero|olivares|cardenas|figueroa|cabrera|campos|vega|carrillo|medina|santana|moreno)$', r'\1 \2', re.IGNORECASE),
        # Palabras comunes pegadas
        (r'^(jose|juan|luis|carlos|miguel|pedro|pablo|diego|daniel|david|mario|julio|cesar|oscar|victor|sergio|ricardo|roberto|eduardo|alberto|alejandro|andres|antonio|manuel|francisco|rafael|gabriel|gonzalo|jorge|jesus|jaime|javier|fernando|federico|felipe|fabian|emilio|enrique|ernesto|esteban|eugenio)(luis|carlos|miguel|antonio|manuel|alberto|eduardo|fernando|david|daniel|pablo|pedro|andres|felipe|diego|mario|julio|cesar|oscar|victor|sergio|ricardo|roberto|alejandro)$', r'\1 \2', re.IGNORECASE),
        # Nombres femeninos pegados
        (r'^(maria|ana|laura|carolina|andrea|daniela|paula|natalia|camila|valentina|sofia|isabella|gabriela|mariana|alejandra|juliana|lucia|valeria|sara|elena|patricia|monica|claudia|sandra|diana|gloria|martha|rosa|carmen|beatriz|adriana|liliana|angelica|veronica|jessica|jennifer|katherine|elizabeth|stephanie|melissa|michelle|nicole|vanessa|tatiana|paola|ximena|yolanda|zulma)(fernanda|alejandra|isabel|victoria|gabriela|camila|valentina|sofia|elena|patricia|monica|claudia|andrea|paula|carolina|daniela|natalia|lucia|beatriz|gloria|rosa|carmen)$', r'\1 \2', re.IGNORECASE),
    ]
    
    for patron, reemplazo, flags in patrones_separacion:
        nombre = re.sub(patron, reemplazo, nombre, flags=flags)
    
    # PASO 4: Limpiar y capitalizar
    # Remover espacios múltiples
    nombre = re.sub(r'\s+', ' ', nombre).strip()
    
    # Capitalizar correctamente
    if nombre:
        palabras = nombre.split()
        palabras_capitalizadas = []
        palabras_minusculas = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'da', 'do', 'dos']
        
        for i, palabra in enumerate(palabras):
            if i == 0 or palabra.lower() not in palabras_minusculas:
                # Capitalizar primera letra, resto en minúsculas
                palabras_capitalizadas.append(palabra[0].upper() + palabra[1:].lower() if len(palabra) > 1 else palabra.upper())
            else:
                palabras_capitalizadas.append(palabra.lower())
        
        nombre = ' '.join(palabras_capitalizadas)
    
    # Validación final
    if not nombre or len(nombre) < 2 or nombre.isdigit():
        return None
    
    return nombre

# Cargar contactos
print("📖 Leyendo archivo CONTACTOS_DEFINITIVOS.json...")
with open('/workspace/CONTACTOS_DEFINITIVOS.json', 'r') as f:
    contactos = json.load(f)

print(f"📊 Total de contactos: {len(contactos)}")

# Procesar cada contacto
contactos_limpios = []
cambios_realizados = []

for contacto in contactos:
    nombre_original = contacto.get('nombre', '')
    nombre_limpio = limpiar_nombre_definitivo(nombre_original)
    
    if nombre_limpio and nombre_limpio != nombre_original:
        cambios_realizados.append({
            'original': nombre_original,
            'limpio': nombre_limpio
        })
    
    if nombre_limpio:
        contactos_limpios.append({
            'nombre': nombre_limpio,
            'telefono': contacto['telefono'],
            'nota': contacto.get('nota')
        })

# Ordenar alfabéticamente
contactos_limpios.sort(key=lambda x: (x['nombre'] or '').lower())

print(f"\n✅ Contactos procesados: {len(contactos_limpios)}")
print(f"🔄 Nombres corregidos: {len(cambios_realizados)}")

# Guardar archivos finales
with open('/workspace/CONTACTOS_ULTRA_LIMPIOS.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_limpios, f, indent=2, ensure_ascii=False)

with open('/workspace/MUESTRA_50_ULTRA_LIMPIOS.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_limpios[:50], f, indent=2, ensure_ascii=False)

print("\n📁 Archivos guardados:")
print("   • /workspace/CONTACTOS_ULTRA_LIMPIOS.json")
print("   • /workspace/MUESTRA_50_ULTRA_LIMPIOS.json")

# Mostrar ejemplos de cambios
print("\n🔍 EJEMPLOS DE CORRECCIONES (primeros 20):")
print("="*80)
for i, cambio in enumerate(cambios_realizados[:20], 1):
    print(f"{i:2}. Antes:   \"{cambio['original']}\"")
    print(f"    Después: \"{cambio['limpio']}\"")
    print("-"*80)

# Mostrar muestra final
print("\n🎯 MUESTRA DE 20 CONTACTOS FINALES:")
print("="*80)
for i, c in enumerate(contactos_limpios[:20], 1):
    print(f"\n{i:2}. {c['nombre']}")
    print(f"    📱 {c['telefono']}")
    if c.get('nota'):
        print(f"    📝 {c['nota']}")