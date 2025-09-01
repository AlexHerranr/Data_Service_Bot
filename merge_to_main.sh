#!/bin/bash

echo "🔄 INICIANDO MERGE A MAIN"
echo "========================"

cd /workspace

# Verificar estado actual
echo "📊 Estado actual:"
git status --short

# Hacer el merge
echo ""
echo "🔀 Haciendo merge de optimize-leads-table en main..."
git merge optimize-leads-table --no-edit

if [ $? -eq 0 ]; then
    echo "✅ Merge completado exitosamente"
    
    echo ""
    echo "📤 Haciendo push a origin/main..."
    git push origin main
    
    if [ $? -eq 0 ]; then
        echo "✅ Push completado exitosamente"
        echo ""
        echo "🎉 TODO COMPLETADO - Cambios en producción (main)"
    else
        echo "❌ Error al hacer push"
    fi
else
    echo "❌ Error al hacer merge"
    echo "Posibles conflictos detectados. Revisar manualmente."
fi

echo ""
echo "📋 Ramas actuales:"
git branch -a