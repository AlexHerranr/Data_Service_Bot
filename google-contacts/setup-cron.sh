#!/bin/bash

# Script para configurar el cron job de sincronización con Google Contacts

echo "🔧 CONFIGURACIÓN DE SINCRONIZACIÓN AUTOMÁTICA"
echo "============================================"

# Verificar que existe el script de sincronización
if [ ! -f "/workspace/google-contacts/sync-google.js" ]; then
    echo "❌ Error: No se encuentra sync-google.js"
    exit 1
fi

# Verificar que existe el token de Google
if [ ! -f "/workspace/google-contacts/token.json" ]; then
    echo "⚠️  Advertencia: No se encuentra token.json"
    echo "   Ejecuta primero: node /workspace/google-contacts/setup-google-auth.js"
fi

# Crear directorio de logs si no existe
mkdir -p /workspace/google-contacts/logs

# Opciones de frecuencia
echo ""
echo "Selecciona la frecuencia de sincronización:"
echo "1) Cada minuto (testing)"
echo "2) Cada 5 minutos (recomendado)"
echo "3) Cada 10 minutos"
echo "4) Cada 30 minutos"
echo "5) Cada hora"
echo "6) Manual (sin cron)"
echo ""
read -p "Opción (1-6): " opcion

case $opcion in
    1)
        CRON_SCHEDULE="* * * * *"
        DESCRIPCION="cada minuto"
        ;;
    2)
        CRON_SCHEDULE="*/5 * * * *"
        DESCRIPCION="cada 5 minutos"
        ;;
    3)
        CRON_SCHEDULE="*/10 * * * *"
        DESCRIPCION="cada 10 minutos"
        ;;
    4)
        CRON_SCHEDULE="*/30 * * * *"
        DESCRIPCION="cada 30 minutos"
        ;;
    5)
        CRON_SCHEDULE="0 * * * *"
        DESCRIPCION="cada hora"
        ;;
    6)
        echo "✅ Configuración manual seleccionada"
        echo "   Para ejecutar manualmente:"
        echo "   cd /workspace/google-contacts && node sync-google.js"
        exit 0
        ;;
    *)
        echo "❌ Opción inválida"
        exit 1
        ;;
esac

# Comando completo del cron
CRON_CMD="cd /workspace/google-contacts && /usr/bin/node sync-google.js >> logs/cron.log 2>&1"

# Verificar si el cron ya existe
crontab -l 2>/dev/null | grep -q "sync-google.js"
if [ $? -eq 0 ]; then
    echo ""
    echo "⚠️  Ya existe un cron job para sync-google.js"
    read -p "¿Deseas reemplazarlo? (s/n): " respuesta
    if [ "$respuesta" != "s" ]; then
        echo "Cancelado"
        exit 0
    fi
    # Eliminar el cron existente
    (crontab -l 2>/dev/null | grep -v "sync-google.js") | crontab -
fi

# Agregar el nuevo cron
(crontab -l 2>/dev/null; echo "$CRON_SCHEDULE $CRON_CMD") | crontab -

echo ""
echo "✅ CRON JOB CONFIGURADO"
echo "   Frecuencia: $DESCRIPCION"
echo "   Comando: $CRON_CMD"
echo ""
echo "📋 Comandos útiles:"
echo "   Ver crons activos:  crontab -l"
echo "   Editar crons:       crontab -e"
echo "   Eliminar crons:     crontab -r"
echo "   Ver logs:           tail -f /workspace/google-contacts/logs/cron.log"
echo "   Ver sync log:       tail -f /workspace/google-contacts/sync-log.txt"
echo ""
echo "🧪 Para probar ahora:"
echo "   cd /workspace/google-contacts && node sync-google.js"