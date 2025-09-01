#!/bin/bash

# Script para procesar archivo completo de contactos
# Uso: ./process-full-contacts.sh archivo_contactos.txt

echo "🚀 PROCESADOR DE CONTACTOS MASIVO"
echo "=================================="

# Check if file argument is provided
if [ $# -eq 0 ]; then
    echo "❌ Error: Debes proporcionar el archivo de contactos"
    echo "Uso: $0 <archivo_contactos.txt>"
    exit 1
fi

INPUT_FILE="$1"

# Check if file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo "❌ Error: El archivo '$INPUT_FILE' no existe"
    exit 1
fi

# Get file stats
FILE_SIZE=$(wc -c < "$INPUT_FILE")
LINE_COUNT=$(wc -l < "$INPUT_FILE")

echo "📁 Archivo: $INPUT_FILE"
echo "📊 Tamaño: $(numfmt --to=iec-i --suffix=B $FILE_SIZE)"
echo "📝 Líneas: $LINE_COUNT"
echo ""

# Copy to working directory
echo "📋 Copiando archivo a directorio de trabajo..."
cp "$INPUT_FILE" /workspace/data-sync/raw-contacts.txt

# Run parser
echo "🔄 Procesando y limpiando contactos..."
cd /workspace/data-sync
node scripts/parse-raw-contacts.js

# Check if cleaning was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Limpieza completada exitosamente"
    
    # Show statistics
    CLEANED_COUNT=$(grep -c "phone" cleaned-contacts.json)
    echo "📊 Contactos limpios: $CLEANED_COUNT"
    
    # Ask for confirmation before importing
    echo ""
    echo "¿Deseas importar estos contactos a la base de datos? (s/n)"
    read -r CONFIRM
    
    if [ "$CONFIRM" = "s" ] || [ "$CONFIRM" = "S" ]; then
        echo "📤 Importando a la base de datos..."
        source .env
        export DATABASE_URL="$DATABASE_URL"
        node scripts/import-cleaned-contacts.js
        
        if [ $? -eq 0 ]; then
            echo "✅ Importación completada"
        else
            echo "❌ Error durante la importación"
            exit 1
        fi
    else
        echo "⏸️  Importación cancelada. Los datos limpios están en:"
        echo "   - cleaned-contacts.json"
        echo "   - cleaned-contacts.csv"
    fi
else
    echo "❌ Error durante el procesamiento"
    exit 1
fi

echo ""
echo "🎉 Proceso completado"