#!/bin/bash

# Script para configurar el cron job de limpieza de threads

echo "🔧 CONFIGURACIÓN DE CRON JOB PARA LIMPIEZA DE THREADS"
echo "======================================================"
echo ""

# Ruta del script
SCRIPT_PATH="/workspace/jobs/cleanup-threads-simple.js"
ENV_PATH="/workspace/data-sync/.env"

# Verificar que los archivos existen
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ Error: No se encuentra el script en $SCRIPT_PATH"
    exit 1
fi

if [ ! -f "$ENV_PATH" ]; then
    echo "❌ Error: No se encuentra el archivo .env en $ENV_PATH"
    exit 1
fi

# Comando completo para el cron
CRON_CMD="cd /workspace/data-sync && source .env && export DATABASE_URL=\"\$DATABASE_URL\" && node ../jobs/cleanup-threads-simple.js"

# Horario del cron (3:00 AM todos los días)
CRON_SCHEDULE="0 3 * * *"

echo "📋 Configuración propuesta:"
echo "  • Horario: 3:00 AM todos los días"
echo "  • Script: $SCRIPT_PATH"
echo "  • Comando: $CRON_CMD"
echo ""

# Verificar si ya existe en crontab
if crontab -l 2>/dev/null | grep -q "cleanup-threads-simple.js"; then
    echo "⚠️ Ya existe un cron job para este script"
    echo ""
    echo "Entrada actual:"
    crontab -l | grep "cleanup-threads-simple.js"
    echo ""
    read -p "¿Deseas reemplazarlo? (s/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        echo "❌ Operación cancelada"
        exit 0
    fi
    # Eliminar entrada existente
    (crontab -l 2>/dev/null | grep -v "cleanup-threads-simple.js") | crontab -
fi

# Agregar nueva entrada al crontab
echo "➕ Agregando entrada al crontab..."
(crontab -l 2>/dev/null; echo "$CRON_SCHEDULE $CRON_CMD") | crontab -

if [ $? -eq 0 ]; then
    echo "✅ Cron job configurado exitosamente"
    echo ""
    echo "📅 El job se ejecutará automáticamente todos los días a las 3:00 AM"
    echo ""
    echo "🔍 Para verificar, usa:"
    echo "  crontab -l"
    echo ""
    echo "🧪 Para probar manualmente, usa:"
    echo "  cd /workspace/data-sync && source .env && export DATABASE_URL=\"\$DATABASE_URL\" && node ../jobs/cleanup-threads-simple.js"
    echo ""
    echo "📊 Para ver el estado actual, usa:"
    echo "  cd /workspace/data-sync && source .env && export DATABASE_URL=\"\$DATABASE_URL\" && node ../jobs/cleanup-threads-simple.js --check"
else
    echo "❌ Error al configurar el cron job"
    exit 1
fi