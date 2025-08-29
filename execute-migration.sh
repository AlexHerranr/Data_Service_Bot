#!/bin/bash

# Script de Migración - Optimización Tabla Leads
# ================================================

echo "🚀 INICIANDO MIGRACIÓN DE TABLA LEADS"
echo "======================================"
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar que DATABASE_URL esté configurada
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ ERROR: DATABASE_URL no está configurada${NC}"
    echo ""
    echo "Por favor configura la variable DATABASE_URL:"
    echo "export DATABASE_URL='postgresql://usuario:password@host:puerto/database'"
    exit 1
fi

echo -e "${GREEN}✅ DATABASE_URL configurada${NC}"
echo ""

# Preguntar confirmación
echo -e "${YELLOW}⚠️  IMPORTANTE:${NC}"
echo "Esta migración va a:"
echo "  1. Hacer backup de la tabla Leads actual"
echo "  2. Crear nueva estructura optimizada (solo 10 campos)"
echo "  3. Migrar todos los datos existentes"
echo "  4. Actualizar triggers de sincronización"
echo "  5. Re-sincronizar con reservas 'Futura Pendiente'"
echo ""
read -p "¿Deseas continuar? (s/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo "Migración cancelada"
    exit 0
fi

echo ""
echo "🔄 Ejecutando migración..."
echo ""

# Opción 1: Ejecutar con TypeScript (si está disponible npx)
if command -v npx &> /dev/null; then
    echo "Ejecutando con TypeScript..."
    cd /workspace/migration-scripts
    npx tsx optimize-leads-minimal.ts
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Migración completada exitosamente${NC}"
    else
        echo -e "${RED}❌ Error en la migración${NC}"
        exit 1
    fi
else
    # Opción 2: Ejecutar SQL directamente
    echo "Ejecutando SQL directamente..."
    psql $DATABASE_URL < /workspace/migration-scripts/optimize-leads.sql
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Migración SQL completada exitosamente${NC}"
    else
        echo -e "${RED}❌ Error en la migración SQL${NC}"
        exit 1
    fi
fi

echo ""
echo "🔄 Regenerando cliente Prisma..."
cd /workspace
npx prisma generate

echo ""
echo -e "${GREEN}🎉 ¡MIGRACIÓN COMPLETADA!${NC}"
echo ""
echo "📊 Verificación rápida:"
echo "----------------------"

# Verificar resultados
psql $DATABASE_URL -t -c "SELECT COUNT(*) as total FROM \"Leads\";" 2>/dev/null | while read count; do
    echo "  Total de Leads: $count"
done

echo ""
echo "✅ La tabla Leads ahora tiene:"
echo "  • Solo 10 campos esenciales"
echo "  • Fechas sin hora (DATE)"
echo "  • Índices optimizados"
echo "  • Sincronización automática con Booking"
echo ""
echo "🚀 Próximos pasos:"
echo "  1. Verificar que los leads se muestren correctamente"
echo "  2. Probar la sincronización con nuevas reservas"
echo "  3. Monitorear el rendimiento"
echo ""