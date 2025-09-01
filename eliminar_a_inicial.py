#!/usr/bin/env python3
import json
import re

def eliminar_a_inicial(nombre):
    """
    Elimina la A mayúscula del principio SOLO si la siguiente letra NO es otra A
    
    Ejemplos:
    - "Andrea" -> NO cambiar (empieza con A pero es parte del nombre)
    - "Aandrea" -> "Andrea" (eliminar primera A porque sigue 'a')
    - "Aangie" -> "Angie" (eliminar primera A porque sigue 'a')
    - "Acarlos" -> "Carlos" (eliminar primera A porque sigue 'c')
    - "Adam" -> NO cambiar (A seguida de 'd' pero es nombre válido)
    - "AAA" -> NO cambiar (A seguida de A mayúscula)
    """
    
    if not nombre or len(nombre) < 2:
        return nombre
    
    # Si empieza con A mayúscula
    if nombre[0] == 'A':
        # Si la siguiente letra NO es otra A mayúscula
        if nombre[1] != 'A':
            # Lista de nombres VÁLIDOS que empiezan con A (no eliminar la A)
            nombres_validos_con_a = [
                'Abad', 'Abel', 'Abraham', 'Abril', 'Ada', 'Adam', 'Adán', 
                'Addison', 'Adelaida', 'Adela', 'Adelina', 'Adolfo', 'Adriana', 
                'Adrián', 'Adriano', 'Agatha', 'Agnes', 'Agustín', 'Agustina', 
                'Aida', 'Aiden', 'Aileen', 'Aimee', 'Aisha', 'Alan', 'Alana', 
                'Alba', 'Albert', 'Alberta', 'Alberto', 'Aldo', 'Alejandra', 
                'Alejandro', 'Alejo', 'Alessandra', 'Alessandro', 'Alex', 'Alexa', 
                'Alexander', 'Alexandra', 'Alexis', 'Alfonso', 'Alfred', 'Alfredo', 
                'Alice', 'Alicia', 'Alina', 'Alison', 'Allan', 'Allen', 'Allison', 
                'Alma', 'Alonso', 'Altagracia', 'Alvaro', 'Álvaro', 'Alyssa', 
                'Amada', 'Amalia', 'Amanda', 'Amaya', 'Amber', 'Amelia', 'America', 
                'Amira', 'Amparo', 'Amy', 'Ana', 'Anabel', 'Anastasia', 'Andrea', 
                'Andrés', 'Andrew', 'Andy', 'Ángel', 'Angela', 'Ángela', 'Angélica', 
                'Angelina', 'Angelo', 'Angie', 'Aníbal', 'Anita', 'Anna', 'Anne', 
                'Annie', 'Anthony', 'Antonia', 'Antonio', 'Antony', 'Anuar', 'Anyela', 
                'Apollo', 'Aquiles', 'Arabella', 'Araceli', 'Aracely', 'Aranza', 
                'Arcadio', 'Ariadna', 'Ariana', 'Ariel', 'Ariela', 'Arlene', 'Arleth', 
                'Armando', 'Arnaldo', 'Arnold', 'Arnulfo', 'Arquímedes', 'Arsenio', 
                'Artemio', 'Arthur', 'Arturo', 'Ashley', 'Astrid', 'Asunción', 
                'Atanasio', 'Athena', 'Aubrey', 'Audrey', 'Augusto', 'Aurelia', 
                'Aurelio', 'Aurora', 'Austin', 'Ava', 'Avelino', 'Avery', 'Axel', 
                'Ayla', 'Azucena', 'Azul',
                # Casos especiales que encontramos
                'Acevedo', 'Acuerdo', 'Administrador', 'Administradora', 'Admisiones',
                'Adp', 'Adrian', 'Adelantos', 'Adatours', 'Adora', 'Addora'
            ]
            
            # Verificar si es un nombre válido (comparación case-insensitive)
            for nombre_valido in nombres_validos_con_a:
                if nombre.lower() == nombre_valido.lower() or nombre.startswith(nombre_valido + ' '):
                    return nombre  # Es un nombre válido, no eliminar la A
            
            # Si no es un nombre válido y la siguiente letra es minúscula, eliminar la A
            if nombre[1].islower():
                # Eliminar la A y capitalizar correctamente
                sin_a = nombre[1:]
                # Capitalizar la primera letra
                if sin_a:
                    return sin_a[0].upper() + sin_a[1:] if len(sin_a) > 1 else sin_a.upper()
                return sin_a
    
    return nombre

# Cargar contactos
print("📖 Leyendo archivo CONTACTOS_100_LIMPIOS.json...")
with open('/workspace/CONTACTOS_100_LIMPIOS.json', 'r') as f:
    contactos = json.load(f)

print(f"📊 Total de contactos: {len(contactos)}")

# Procesar cada contacto
contactos_corregidos = []
cambios = []

for contacto in contactos:
    nombre_original = contacto.get('nombre', '')
    nombre_corregido = eliminar_a_inicial(nombre_original)
    
    if nombre_corregido != nombre_original:
        cambios.append({
            'original': nombre_original,
            'corregido': nombre_corregido
        })
    
    contactos_corregidos.append({
        'nombre': nombre_corregido,
        'telefono': contacto['telefono'],
        'nota': contacto.get('nota')
    })

# Ordenar alfabéticamente
contactos_corregidos.sort(key=lambda x: (x['nombre'] or '').lower())

print(f"\n✅ Nombres corregidos: {len(cambios)}")
print(f"📝 Total final: {len(contactos_corregidos)} contactos")

# Guardar archivos finales
with open('/workspace/CONTACTOS_FINALES_SIN_A.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_corregidos, f, indent=2, ensure_ascii=False)

with open('/workspace/MUESTRA_50_SIN_A.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_corregidos[:50], f, indent=2, ensure_ascii=False)

print("\n📁 ARCHIVOS GUARDADOS:")
print("   ✅ /workspace/CONTACTOS_FINALES_SIN_A.json")
print("   ✅ /workspace/MUESTRA_50_SIN_A.json")

# Mostrar ejemplos de cambios
print("\n🔍 EJEMPLOS DE CORRECCIONES:")
print("="*80)
for i, cambio in enumerate(cambios[:30], 1):
    print(f"{i:2}. \"{cambio['original']}\" → \"{cambio['corregido']}\"")

# Verificar casos específicos
print("\n✅ VERIFICACIÓN DE CASOS ESPECÍFICOS:")
print("="*80)
casos_verificar = [
    "andrea", "angie", "carlos", "cesar", "andres", "diana"
]
for caso in casos_verificar:
    encontrados = [c for c in contactos_corregidos if caso in (c.get('nombre', '').lower())][:3]
    if encontrados:
        print(f"\n{caso.upper()}:")
        for e in encontrados:
            print(f"  • {e['nombre']}")