# 🚀 Guía de Deployment - Migración Tabla Leads

## ⚡ Ejecución Rápida en Railway

### Opción 1: Railway CLI (Recomendado)

```bash
# 1. Conectar a tu proyecto Railway
railway link

# 2. Ejecutar la migración
railway run npx tsx migration-scripts/optimize-leads-minimal.ts

# 3. Verificar resultados
railway run npx prisma studio
```

### Opción 2: Railway Dashboard

1. Ve a tu proyecto en Railway Dashboard
2. Abre la terminal del servicio `data-sync`
3. Ejecuta estos comandos:

```bash
# Cambiar al directorio del proyecto
cd /app

# Ejecutar migración
npx tsx migration-scripts/optimize-leads-minimal.ts

# Verificar
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Leads\";"
```

### Opción 3: Conexión Directa a PostgreSQL

Si tienes acceso directo a la base de datos:

```bash
# Conectar a la BD
psql "postgresql://usuario:password@host:puerto/database"

# Ejecutar el SQL directamente
\i /workspace/migration-scripts/optimize-leads.sql
```

## 📋 Verificación Post-Migración

### 1. Verificar Estructura Nueva

```sql
-- Ver columnas de la tabla
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'Leads'
ORDER BY ordinal_position;

-- Debe mostrar solo 10 campos:
-- id, bookingId, guestName, phone, propertyName,
-- arrivalDate, departureDate, numNights, totalPersons,
-- channel, createdAt
```

### 2. Verificar Datos Migrados

```sql
-- Contar leads
SELECT COUNT(*) FROM "Leads";

-- Ver muestra de datos
SELECT 
    "guestName",
    "propertyName",
    TO_CHAR("arrivalDate", 'DD/MM/YYYY') as arrival,
    "numNights",
    "channel"
FROM "Leads" 
ORDER BY "arrivalDate"
LIMIT 5;
```

### 3. Verificar Triggers

```sql
-- Listar triggers activos
SELECT trigger_name, event_manipulation 
FROM information_schema.triggers 
WHERE event_object_table = 'Booking';

-- Debe mostrar:
-- trg_Booking_sync_leads (INSERT OR UPDATE)
-- trg_Booking_delete_sync_leads (DELETE)
```

### 4. Test de Sincronización

```sql
-- Cambiar una reserva a "Futura Pendiente" (debe crear lead)
UPDATE "Booking" 
SET "BDStatus" = 'Futura Pendiente' 
WHERE "bookingId" = 'cualquier-id-existente'
LIMIT 1;

-- Verificar que se creó el lead
SELECT * FROM "Leads" WHERE "bookingId" = 'ese-id';

-- Cambiar a otro estado (debe eliminar lead)
UPDATE "Booking" 
SET "BDStatus" = 'Futura Confirmada' 
WHERE "bookingId" = 'ese-id';

-- Verificar que se eliminó
SELECT * FROM "Leads" WHERE "bookingId" = 'ese-id';
-- Debe retornar 0 filas
```

## 🔄 Rollback (Si es Necesario)

Si necesitas revertir los cambios:

```sql
-- 1. Restaurar tabla antigua (si aún existe)
ALTER TABLE "Leads" RENAME TO "Leads_optimized";
ALTER TABLE "Leads_old" RENAME TO "Leads";

-- 2. Restaurar triggers antiguos
-- (Los scripts de backup están en el código de migración)
```

## 📊 Monitoreo Post-Deployment

### Métricas a Verificar:

1. **Performance de Queries**
```sql
-- Tiempo de respuesta para listar leads
EXPLAIN ANALYZE 
SELECT * FROM "Leads" 
WHERE "arrivalDate" >= CURRENT_DATE 
ORDER BY "arrivalDate" 
LIMIT 100;
```

2. **Uso de Espacio**
```sql
-- Tamaño de la tabla
SELECT 
    pg_size_pretty(pg_total_relation_size('"Leads"')) as size;
```

3. **Sincronización Automática**
- Verificar logs del trigger
- Confirmar que nuevas reservas "Futura Pendiente" aparecen en Leads
- Confirmar que cambios de estado eliminan de Leads

## ✅ Checklist Final

- [ ] Migración ejecutada sin errores
- [ ] Todos los leads migrados correctamente
- [ ] Fechas mostradas sin hora (solo fecha)
- [ ] Triggers funcionando correctamente
- [ ] Sincronización automática activa
- [ ] Performance mejorada
- [ ] Cliente Prisma regenerado
- [ ] Aplicación funcionando normalmente

## 🆘 Troubleshooting

### Error: "permission denied"
```bash
# Verificar permisos del usuario
SELECT current_user, has_table_privilege(current_user, 'Leads', 'ALL');
```

### Error: "relation does not exist"
```bash
# Verificar que estás en la BD correcta
SELECT current_database();
\dt "Leads"
```

### Error: "duplicate key value"
```bash
# Limpiar duplicados antes de migrar
DELETE FROM "Leads" 
WHERE id NOT IN (
    SELECT MIN(id) 
    FROM "Leads" 
    GROUP BY "bookingId"
);
```

## 📞 Soporte

Si encuentras problemas:
1. Revisa los logs en Railway Dashboard
2. Verifica la conexión a la BD
3. Confirma que el schema de Prisma está actualizado
4. Los scripts incluyen rollback automático en caso de error

---

**¡La migración está lista para ejecutarse en producción!** 🚀