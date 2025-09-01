#!/usr/bin/env python3
import json
import csv
from datetime import datetime

print("🔍 PROCESANDO RESULTADOS DE VALIDACIÓN WHAPI")
print("="*80)

# 1. Leer números inválidos
numeros_invalidos = set()
with open('invalid.csv', 'r') as f:
    for line in f:
        numero = line.strip()
        if numero:
            numeros_invalidos.add(numero)
            numeros_invalidos.add('+' + numero)  # También con +

print(f"❌ Números SIN WhatsApp: {len(numeros_invalidos)//2}")

# 2. Leer números válidos del result.csv
numeros_validos = set()
with open('result.csv', 'r') as f:
    reader = csv.reader(f)
    for row in reader:
        if row and len(row) >= 2 and row[1] == 'valid':
            numero = row[0].strip()
            numeros_validos.add(numero)
            numeros_validos.add('+' + numero)

print(f"✅ Números CON WhatsApp: {len(numeros_validos)//2}")

# 3. Leer contactos originales
with open('CONTACTOS_FINALES_SIN_A.json', 'r') as f:
    contactos_originales = json.load(f)

print(f"📊 Total contactos originales: {len(contactos_originales)}")

# 4. Filtrar contactos
contactos_validos = []
contactos_invalidos = []

for contacto in contactos_originales:
    telefono = contacto['telefono']
    telefono_sin_mas = telefono.replace('+', '')
    
    # Verificar si está en la lista de inválidos
    if telefono_sin_mas in numeros_invalidos or telefono in numeros_invalidos:
        contactos_invalidos.append(contacto)
    else:
        contactos_validos.append(contacto)

print(f"\n📈 RESULTADOS:")
print(f"   Contactos CON WhatsApp:    {len(contactos_validos):,}")
print(f"   Contactos SIN WhatsApp:    {len(contactos_invalidos):,}")
print(f"   Porcentaje válido:         {(len(contactos_validos)/len(contactos_originales)*100):.1f}%")

# 5. Guardar archivos
# Contactos válidos
with open('CONTACTOS_CON_WHATSAPP.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_validos, f, indent=2, ensure_ascii=False)

# Muestra de 50 válidos
with open('MUESTRA_50_CON_WHATSAPP.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_validos[:50], f, indent=2, ensure_ascii=False)

# Contactos inválidos (para referencia)
with open('CONTACTOS_ELIMINADOS_SIN_WHATSAPP.json', 'w', encoding='utf-8') as f:
    json.dump(contactos_invalidos, f, indent=2, ensure_ascii=False)

print("\n📁 ARCHIVOS GENERADOS:")
print(f"   ✅ CONTACTOS_CON_WHATSAPP.json ({len(contactos_validos)} contactos)")
print(f"   ✅ MUESTRA_50_CON_WHATSAPP.json (muestra)")
print(f"   ❌ CONTACTOS_ELIMINADOS_SIN_WHATSAPP.json ({len(contactos_invalidos)} contactos)")

# 6. Crear script SQL para eliminar de la BD
print("\n🗄️ GENERANDO SCRIPT SQL...")
with open('eliminar_contactos_sin_whatsapp.sql', 'w', encoding='utf-8') as f:
    f.write("-- Script para eliminar contactos sin WhatsApp de la base de datos\n")
    f.write(f"-- Generado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write(f"-- Total a eliminar: {len(contactos_invalidos)} contactos\n\n")
    
    f.write("BEGIN;\n\n")
    
    # Crear tabla temporal
    f.write("-- Crear tabla temporal con números a eliminar\n")
    f.write("CREATE TEMP TABLE IF NOT EXISTS numeros_a_eliminar (telefono VARCHAR(50));\n\n")
    
    # Insertar números en lotes de 100
    f.write("-- Insertar números sin WhatsApp\n")
    batch_size = 100
    for i in range(0, len(contactos_invalidos), batch_size):
        batch = contactos_invalidos[i:i+batch_size]
        values = []
        for contacto in batch:
            telefono = contacto['telefono'].replace("'", "''")
            values.append(f"('{telefono}')")
        
        f.write(f"INSERT INTO numeros_a_eliminar (telefono) VALUES\n")
        f.write(",\n".join(values))
        f.write(";\n\n")
    
    # Mostrar preview antes de eliminar
    f.write("-- Preview de lo que se va a eliminar\n")
    f.write("SELECT COUNT(*) as total_a_eliminar FROM \"Contactos\" WHERE \"phoneNumber\" IN (SELECT telefono FROM numeros_a_eliminar);\n\n")
    
    # Eliminar de las tablas
    f.write("-- Eliminar de la tabla Contactos\n")
    f.write("DELETE FROM \"Contactos\" WHERE \"phoneNumber\" IN (SELECT telefono FROM numeros_a_eliminar);\n\n")
    
    f.write("-- Eliminar de IA_CRM_Clientes si existe\n")
    f.write("DELETE FROM \"IA_CRM_Clientes\" WHERE \"phoneNumber\" IN (SELECT telefono FROM numeros_a_eliminar);\n\n")
    
    # NO eliminar de ClientView como solicitaste
    f.write("-- ClientView NO se toca, se alimenta sola de conversaciones activas\n\n")
    
    f.write("-- Verificar resultados\n")
    f.write("SELECT 'Contactos restantes:' as info, COUNT(*) as total FROM \"Contactos\";\n")
    
    f.write("\nCOMMIT;\n")
    f.write("\n-- Para revertir si algo sale mal: ROLLBACK;\n")

print("   ✅ eliminar_contactos_sin_whatsapp.sql")

# 7. Análisis por país
print("\n🌍 ANÁLISIS POR PAÍS (contactos válidos):")
paises = {}
for contacto in contactos_validos:
    telefono = contacto['telefono']
    if telefono.startswith('+'):
        if telefono.startswith('+57'):
            pais = 'Colombia'
        elif telefono.startswith('+1'):
            pais = 'USA/Canadá'
        elif telefono.startswith('+52'):
            pais = 'México'
        elif telefono.startswith('+54'):
            pais = 'Argentina'
        elif telefono.startswith('+34'):
            pais = 'España'
        elif telefono.startswith('+44'):
            pais = 'Reino Unido'
        elif telefono.startswith('+55'):
            pais = 'Brasil'
        elif telefono.startswith('+51'):
            pais = 'Perú'
        elif telefono.startswith('+593'):
            pais = 'Ecuador'
        elif telefono.startswith('+507'):
            pais = 'Panamá'
        elif telefono.startswith('+506'):
            pais = 'Costa Rica'
        elif telefono.startswith('+503'):
            pais = 'El Salvador'
        else:
            codigo = telefono[1:3]
            pais = f'Código +{codigo}'
        
        paises[pais] = paises.get(pais, 0) + 1

# Ordenar por cantidad
paises_ordenados = sorted(paises.items(), key=lambda x: x[1], reverse=True)
for pais, cantidad in paises_ordenados[:10]:
    porcentaje = (cantidad / len(contactos_validos)) * 100
    print(f"   {pais:<20} {cantidad:5,} contactos ({porcentaje:5.1f}%)")

# 8. Ejemplos de eliminados
print("\n❌ EJEMPLOS DE CONTACTOS A ELIMINAR (10 primeros):")
for i, contacto in enumerate(contactos_invalidos[:10], 1):
    nombre = contacto.get('nombre', 'Sin nombre')
    telefono = contacto['telefono']
    nota = contacto.get('nota', '')
    print(f"   {i:2}. {nombre:<30} | {telefono}")
    if nota:
        print(f"       Nota: {nota}")

print("\n✅ EJEMPLOS DE CONTACTOS VÁLIDOS (10 primeros):")
for i, contacto in enumerate(contactos_validos[:10], 1):
    nombre = contacto.get('nombre', 'Sin nombre')
    telefono = contacto['telefono']
    print(f"   {i:2}. {nombre:<30} | {telefono}")

print("\n" + "="*80)
print("✅ PROCESO COMPLETADO")
print("="*80)
print("\n🎯 PRÓXIMOS PASOS:")
print("1. Revisa CONTACTOS_ELIMINADOS_SIN_WHATSAPP.json")
print("2. Ejecuta el SQL: eliminar_contactos_sin_whatsapp.sql")
print("3. Los contactos válidos están en: CONTACTOS_CON_WHATSAPP.json")