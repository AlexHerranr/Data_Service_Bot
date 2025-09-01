#!/usr/bin/env python3
import json
import csv
import os
from datetime import datetime

def limpiar_contactos_sin_whatsapp():
    """
    Limpia contactos que no tienen WhatsApp activo según validación de Whapi
    """
    
    print("🔍 LIMPIEZA DE CONTACTOS SIN WHATSAPP")
    print("="*80)
    
    # PASO 1: Buscar archivo de resultados de Whapi
    archivos_posibles = [
        'numeros_con_whatsapp.csv',
        'whapi_results.csv',
        'validated_numbers.csv',
        'whatsapp_valid.csv',
        'resultados_whapi.csv'
    ]
    
    archivo_whapi = None
    for archivo in archivos_posibles:
        if os.path.exists(archivo):
            archivo_whapi = archivo
            print(f"✅ Encontrado archivo de Whapi: {archivo}")
            break
    
    if not archivo_whapi:
        print("⚠️  No se encontró archivo de resultados de Whapi")
        print("   Archivos buscados:", ", ".join(archivos_posibles))
        print("\n📝 INSTRUCCIONES:")
        print("   1. Descarga el archivo de resultados de Whapi")
        print("   2. Renómbralo a uno de estos nombres:")
        for archivo in archivos_posibles[:3]:
            print(f"      - {archivo}")
        print("   3. Colócalo en el directorio /workspace/")
        print("   4. Ejecuta este script nuevamente")
        return
    
    # PASO 2: Leer números válidos de WhatsApp
    numeros_con_whatsapp = set()
    
    # Intentar diferentes formatos de CSV
    with open(archivo_whapi, 'r', encoding='utf-8') as f:
        contenido = f.read()
        
        # Si es CSV con headers
        if ',' in contenido or ';' in contenido:
            f.seek(0)
            reader = csv.reader(f)
            headers = next(reader, None)
            
            # Buscar columna de número
            col_numero = 0
            if headers:
                for i, header in enumerate(headers):
                    if 'number' in header.lower() or 'phone' in header.lower() or 'telefono' in header.lower():
                        col_numero = i
                        break
            
            # Leer números
            f.seek(0)
            next(reader, None)  # Skip header
            for row in reader:
                if row and len(row) > col_numero:
                    numero = row[col_numero].strip()
                    if numero:
                        numeros_con_whatsapp.add(numero)
                        numeros_con_whatsapp.add('+' + numero)
        else:
            # Simple lista de números
            for linea in contenido.split('\n'):
                numero = linea.strip()
                if numero and numero[0].isdigit():
                    numeros_con_whatsapp.add(numero)
                    numeros_con_whatsapp.add('+' + numero)
    
    print(f"✅ Números con WhatsApp detectados: {len(numeros_con_whatsapp)//2}")
    
    # PASO 3: Leer contactos originales
    with open('CONTACTOS_FINALES_SIN_A.json', 'r', encoding='utf-8') as f:
        contactos_originales = json.load(f)
    
    print(f"📊 Total contactos originales: {len(contactos_originales)}")
    
    # PASO 4: Filtrar contactos
    contactos_con_whatsapp = []
    contactos_sin_whatsapp = []
    
    for contacto in contactos_originales:
        telefono = contacto['telefono']
        telefono_sin_mas = telefono.replace('+', '')
        
        if telefono in numeros_con_whatsapp or telefono_sin_mas in numeros_con_whatsapp:
            contactos_con_whatsapp.append(contacto)
        else:
            contactos_sin_whatsapp.append(contacto)
    
    print(f"✅ Contactos CON WhatsApp: {len(contactos_con_whatsapp)}")
    print(f"❌ Contactos SIN WhatsApp: {len(contactos_sin_whatsapp)}")
    
    # PASO 5: Guardar archivos
    # Contactos válidos
    with open('CONTACTOS_VALIDADOS_WHATSAPP.json', 'w', encoding='utf-8') as f:
        json.dump(contactos_con_whatsapp, f, indent=2, ensure_ascii=False)
    
    # Muestra de 50
    with open('MUESTRA_50_VALIDADOS.json', 'w', encoding='utf-8') as f:
        json.dump(contactos_con_whatsapp[:50], f, indent=2, ensure_ascii=False)
    
    # Contactos excluidos (para referencia)
    with open('CONTACTOS_SIN_WHATSAPP.json', 'w', encoding='utf-8') as f:
        json.dump(contactos_sin_whatsapp, f, indent=2, ensure_ascii=False)
    
    # PASO 6: Crear script SQL para limpiar BD
    with open('limpiar_contactos_bd.sql', 'w', encoding='utf-8') as f:
        f.write("-- Script para limpiar contactos sin WhatsApp de la base de datos\n")
        f.write(f"-- Generado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"-- Total a eliminar: {len(contactos_sin_whatsapp)} contactos\n\n")
        
        f.write("BEGIN;\n\n")
        
        # Crear tabla temporal con números a eliminar
        f.write("-- Crear tabla temporal con números a eliminar\n")
        f.write("CREATE TEMP TABLE numeros_a_eliminar (telefono VARCHAR(50));\n\n")
        
        # Insertar números
        f.write("-- Insertar números sin WhatsApp\n")
        for contacto in contactos_sin_whatsapp:
            telefono = contacto['telefono'].replace("'", "''")
            f.write(f"INSERT INTO numeros_a_eliminar VALUES ('{telefono}');\n")
        
        f.write("\n-- Eliminar de las tablas\n")
        f.write("DELETE FROM \"Contactos\" WHERE \"phoneNumber\" IN (SELECT telefono FROM numeros_a_eliminar);\n")
        f.write("DELETE FROM \"ClientView\" WHERE \"phoneNumber\" IN (SELECT telefono FROM numeros_a_eliminar);\n")
        f.write("DELETE FROM \"IA_CRM_Clientes\" WHERE \"phoneNumber\" IN (SELECT telefono FROM numeros_a_eliminar);\n")
        
        f.write("\n-- Mostrar resultados\n")
        f.write("SELECT 'Contactos eliminados de Contactos:' as tabla, COUNT(*) as eliminados FROM numeros_a_eliminar;\n")
        
        f.write("\nCOMMIT;\n")
    
    # PASO 7: Resumen y estadísticas
    print("\n📊 RESUMEN FINAL:")
    print("="*80)
    print(f"Contactos originales:     {len(contactos_originales):,}")
    print(f"Contactos con WhatsApp:   {len(contactos_con_whatsapp):,}")
    print(f"Contactos sin WhatsApp:   {len(contactos_sin_whatsapp):,}")
    print(f"Porcentaje válido:        {(len(contactos_con_whatsapp)/len(contactos_originales)*100):.1f}%")
    print(f"Porcentaje eliminado:     {(len(contactos_sin_whatsapp)/len(contactos_originales)*100):.1f}%")
    
    print("\n📁 ARCHIVOS GENERADOS:")
    print("   ✅ CONTACTOS_VALIDADOS_WHATSAPP.json - Contactos con WhatsApp")
    print("   ✅ MUESTRA_50_VALIDADOS.json - Muestra de 50 contactos")
    print("   ❌ CONTACTOS_SIN_WHATSAPP.json - Contactos eliminados")
    print("   🗄️  limpiar_contactos_bd.sql - Script SQL para limpiar BD")
    
    # Mostrar ejemplos
    if contactos_sin_whatsapp:
        print("\n❌ EJEMPLOS DE CONTACTOS SIN WHATSAPP (primeros 10):")
        for i, contacto in enumerate(contactos_sin_whatsapp[:10], 1):
            nombre = contacto.get('nombre', 'Sin nombre')
            telefono = contacto['telefono']
            nota = contacto.get('nota', '')
            if nota:
                print(f"   {i:2}. {nombre:<30} | {telefono} | {nota}")
            else:
                print(f"   {i:2}. {nombre:<30} | {telefono}")
    
    if contactos_con_whatsapp:
        print("\n✅ EJEMPLOS DE CONTACTOS CON WHATSAPP (primeros 10):")
        for i, contacto in enumerate(contactos_con_whatsapp[:10], 1):
            nombre = contacto.get('nombre', 'Sin nombre')
            telefono = contacto['telefono']
            print(f"   {i:2}. {nombre:<30} | {telefono}")
    
    # Análisis por país
    print("\n🌍 ANÁLISIS POR PAÍS (contactos con WhatsApp):")
    paises = {}
    for contacto in contactos_con_whatsapp:
        telefono = contacto['telefono']
        # Extraer código de país (primeros 2-3 dígitos después del +)
        if telefono.startswith('+'):
            codigo = telefono[1:3]
            if codigo == '57':  # Colombia
                pais = 'Colombia'
            elif codigo == '1':  # USA/Canadá
                pais = 'USA/Canadá'
            elif codigo == '52':  # México
                pais = 'México'
            elif codigo == '54':  # Argentina
                pais = 'Argentina'
            elif codigo == '34':  # España
                pais = 'España'
            elif codigo == '44':  # UK
                pais = 'Reino Unido'
            elif codigo == '55':  # Brasil
                pais = 'Brasil'
            elif codigo == '51':  # Perú
                pais = 'Perú'
            elif codigo == '59':  # Ecuador/Uruguay
                pais = 'Ecuador/Uruguay'
            elif codigo == '50':  # Centroamérica
                pais = 'Centroamérica'
            else:
                pais = f'Código +{codigo}'
            
            paises[pais] = paises.get(pais, 0) + 1
    
    # Ordenar por cantidad
    paises_ordenados = sorted(paises.items(), key=lambda x: x[1], reverse=True)
    for pais, cantidad in paises_ordenados[:10]:
        porcentaje = (cantidad / len(contactos_con_whatsapp)) * 100
        print(f"   {pais:<20} {cantidad:5,} contactos ({porcentaje:5.1f}%)")

if __name__ == "__main__":
    limpiar_contactos_sin_whatsapp()