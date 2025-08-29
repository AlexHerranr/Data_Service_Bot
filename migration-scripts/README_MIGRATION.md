# 📋 Guía de Migración - Optimización Tabla Leads

## 🎯 Objetivo
Simplificar la tabla `Leads` manteniendo solo campos esenciales para gestión comercial de reservas "Futura Pendiente".

## 📊 Cambios Principales

### ✅ Campos que se MANTIENEN:
- `bookingId` - Identificador único
- `guestName` - Nombre del huésped
- `phone` - Teléfono de contacto
- `propertyName` - Propiedad reservada
- `arrivalDate` - Fecha llegada (solo fecha, sin hora)
- `departureDate` - Fecha salida (solo fecha, sin hora)
- `numNights` - Número de noches
- `totalPersons` - Total de personas
- `channel` - Canal de reserva
- `createdAt` - Fecha de creación del lead

### ❌ Campos que se ELIMINAN:
- `source` - Siempre era "beds24"
- `priority` - No se usaba
- `notes` - No se usaba
- `lastUpdatedLeads` - Redundante
- `lastUpdated` - Redundante
- `estimatedValue` - No se usaba
- `assignedTo` - No se usaba
- `lastContactAt` - No se usaba
- `nextFollowUp` - No se usaba

## 🚀 Pasos para Ejecutar la Migración

### 1. Configurar Variables de Entorno

```bash
# En Railway o tu entorno de producción
export DATABASE_URL="postgresql://usuario:password@host:puerto/database"
```

### 2. Generar Cliente Prisma

```bash
cd /workspace
npx prisma generate
```

### 3. Ejecutar Script de Migración

```bash
cd /workspace/migration-scripts
npx tsx optimize-leads-minimal.ts
```

## 📝 Qué hace el Script

1. **Backup**: Guarda todos los datos actuales de Leads
2. **Nueva Tabla**: Crea tabla temporal con estructura optimizada
3. **Índices**: Crea índices optimizados para búsquedas
4. **Migración**: Transfiere datos a nueva estructura
5. **Trigger**: Actualiza función de sincronización
6. **Renombrado**: Reemplaza tabla vieja por nueva
7. **Sincronización**: Re-sincroniza con Bookings actuales
8. **Verificación**: Confirma integridad de datos
9. **Limpieza**: Elimina tabla antigua

## ⚠️ Consideraciones Importantes

1. **Downtime**: La migración toma ~1-2 minutos
2. **Rollback**: El script incluye rollback automático en caso de error
3. **Triggers**: Se recrean automáticamente
4. **Sincronización**: Los leads se re-sincronizan desde Booking

## 🔄 Sincronización Automática

Después de la migración:
- Reservas con `BDStatus = 'Futura Pendiente'` → Se agregan a Leads
- Cambio a cualquier otro estado → Se eliminan de Leads
- Eliminación de booking → Lead eliminado automáticamente

## 🧪 Verificación Post-Migración

```sql
-- Verificar estructura
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'Leads';

-- Contar leads
SELECT COUNT(*) FROM "Leads";

-- Ver muestra
SELECT 
    "guestName",
    "propertyName",
    TO_CHAR("arrivalDate", 'DD/MM/YYYY') as arrival,
    "numNights",
    "channel"
FROM "Leads" 
LIMIT 10;
```

## 🆘 Troubleshooting

### Error: DATABASE_URL not found
```bash
# Asegúrate de configurar la variable
export DATABASE_URL="tu_connection_string"
```

### Error: Permission denied
```bash
# Asegúrate de tener permisos de ALTER TABLE
# Contacta al DBA si es necesario
```

### Error: Trigger conflicts
```bash
# Desactiva triggers temporalmente
ALTER TABLE "Booking" DISABLE TRIGGER ALL;
# Ejecuta migración
# Re-activa triggers
ALTER TABLE "Booking" ENABLE TRIGGER ALL;
```

## 📞 Soporte

Si encuentras problemas durante la migración:
1. Revisa los logs del script
2. Verifica la conexión a la base de datos
3. Confirma permisos de usuario
4. El script incluye rollback automático en caso de error