# 🤖 Jobs de Mantenimiento WhatsApp

## 📋 Descripción

Este directorio contiene jobs programados para el mantenimiento automático de la integración con WhatsApp.

## 🧹 Job de Limpieza de Threads

### Propósito
Limpiar automáticamente los threads de WhatsApp cuando alcanzan **1 millón de tokens**, para evitar costos excesivos de API y mantener el sistema optimizado.

### ¿Qué hace?
1. Busca en `ClientView` todos los registros donde `threadTokenCount >= 1,000,000`
2. Para cada registro encontrado:
   - Establece `threadId = NULL`
   - Establece `threadTokenCount = 0`
3. Registra la operación en una tabla de auditoría

### Archivos

| Archivo | Descripción |
|---------|-------------|
| `cleanup-threads-simple.js` | Script principal de limpieza (versión simple) |
| `cleanup-whatsapp-threads.js` | Script con cron integrado (requiere npm install) |
| `setup-cron.sh` | Script para configurar cron automáticamente |
| `package.json` | Dependencias para la versión con cron |

## 🚀 Uso

### Verificar Estado Actual

```bash
cd /workspace/data-sync
source .env
export DATABASE_URL="$DATABASE_URL"
node ../jobs/cleanup-threads-simple.js --check
```

Muestra:
- Total de contactos
- Threads con tokens activos
- Threads cerca del límite
- Top 10 threads con más tokens

### Ejecutar Limpieza Manual

```bash
cd /workspace/data-sync
source .env
export DATABASE_URL="$DATABASE_URL"
node ../jobs/cleanup-threads-simple.js
```

### Configurar Ejecución Automática

#### Opción 1: Usar el script de configuración

```bash
/workspace/jobs/setup-cron.sh
```

#### Opción 2: Configurar manualmente con crontab

```bash
crontab -e
```

Agregar la línea:
```
0 3 * * * cd /workspace/data-sync && source .env && export DATABASE_URL="$DATABASE_URL" && node ../jobs/cleanup-threads-simple.js
```

## ⏰ Programación

El job está configurado para ejecutarse:
- **Horario**: 3:00 AM
- **Frecuencia**: Todos los días
- **Zona horaria**: Servidor local

## 📊 Monitoreo

### Ver logs del cron
```bash
grep CRON /var/log/syslog
```

### Ver tabla de auditoría
```sql
SELECT * FROM "ThreadCleanupLog" 
ORDER BY execution_time DESC 
LIMIT 10;
```

## 🔍 Criterios de Limpieza

| Campo | Condición | Acción |
|-------|-----------|--------|
| `threadTokenCount` | >= 1,000,000 | Limpiar thread |
| `threadId` | NOT NULL | Establecer a NULL |
| `threadTokenCount` | Cualquier valor | Resetear a 0 |

## 📈 Estados y Umbrales

| Porcentaje | Tokens | Estado | Acción |
|------------|--------|--------|--------|
| 0-50% | 0-500K | ✅ Normal | Ninguna |
| 50-80% | 500K-800K | ⚠️ Precaución | Monitorear |
| 80-100% | 800K-1M | 🔶 Advertencia | Preparar limpieza |
| >100% | >1M | 🔴 Crítico | Limpiar automáticamente |

## 🗂️ Tabla de Auditoría

La tabla `ThreadCleanupLog` registra:
- `id`: ID único del registro
- `cleaned_count`: Número de threads limpiados
- `total_tokens_cleared`: Total de tokens liberados
- `execution_time`: Fecha y hora de ejecución
- `details`: JSON con detalles de cada thread limpiado

## 🛠️ Troubleshooting

### El job no se ejecuta
1. Verificar que el cron esté activo: `service cron status`
2. Verificar la entrada: `crontab -l`
3. Verificar permisos del script

### Error de conexión a BD
1. Verificar DATABASE_URL en `/workspace/data-sync/.env`
2. Verificar conectividad con la base de datos

### Threads no se limpian
1. Ejecutar con `--check` para ver estado
2. Verificar que `threadTokenCount` realmente excede 1M
3. Revisar logs de error en la ejecución manual

## 📝 Notas Importantes

1. **Impacto en conversaciones**: Al limpiar el `threadId`, se pierde el contexto de la conversación con la IA
2. **Frecuencia**: Una vez al día es suficiente para la mayoría de casos
3. **Backup**: Los datos se registran en `ThreadCleanupLog` antes de limpiar
4. **Reversibilidad**: La operación NO es reversible (el threadId se pierde)

## 🔄 Actualizaciones Futuras

Posibles mejoras:
- [ ] Notificación por email cuando se ejecuta limpieza
- [ ] Configuración dinámica del límite de tokens
- [ ] Exportar threads antes de limpiar
- [ ] Dashboard de monitoreo
- [ ] Limpieza gradual (avisos antes de limpiar)

---

**Última actualización**: 29 de Agosto 2025  
**Versión**: 1.0.0  
**Autor**: Sistema de Mantenimiento Automático