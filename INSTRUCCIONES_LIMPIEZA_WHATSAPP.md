# 🧹 LIMPIEZA DE CONTACTOS SIN WHATSAPP

## 📋 Proceso Completo

### 1️⃣ Validación en Whapi (EN PROCESO)
- **Archivo subido**: `telefonos_para_validar_whapi.csv`
- **Total números**: 6,048
- **Tiempo estimado**: 30-40 minutos
- **Configuración**: 1,947 números cada 10 minutos

### 2️⃣ Cuando tengas los resultados de Whapi

#### Opción A: Usar el script de Python (RECOMENDADO)
```bash
cd /workspace
python3 limpiar_contactos_sin_whatsapp.py
```

El script buscará automáticamente estos archivos:
- `numeros_con_whatsapp.csv`
- `whapi_results.csv`
- `validated_numbers.csv`
- `resultados_whapi.csv`

#### Opción B: Usar el script de Node.js
```bash
cd /workspace/scripts
node limpiar_contactos_sin_whatsapp.js
```

### 3️⃣ Archivos que se generarán

| Archivo | Descripción |
|---------|-------------|
| `CONTACTOS_VALIDADOS_WHATSAPP.json` | ✅ Solo contactos CON WhatsApp |
| `MUESTRA_50_VALIDADOS.json` | 📝 Muestra de 50 contactos validados |
| `CONTACTOS_SIN_WHATSAPP.json` | ❌ Contactos eliminados (referencia) |
| `limpiar_contactos_bd.sql` | 🗄️ Script SQL para limpiar la BD |

### 4️⃣ Limpieza de la Base de Datos

El script generará automáticamente un archivo SQL que eliminará los contactos sin WhatsApp de estas tablas:
- `Contactos`
- `ClientView`
- `IA_CRM_Clientes`

Para ejecutar la limpieza:
```sql
-- En tu cliente SQL o Railway
-- Ejecuta el contenido de: limpiar_contactos_bd.sql
```

## 📊 Estadísticas Esperadas

Basado en experiencias típicas:
- **70-80%** de los números suelen tener WhatsApp activo
- **20-30%** podrían ser eliminados

Para 6,048 contactos:
- ✅ Esperados con WhatsApp: ~4,200-4,800
- ❌ Esperados sin WhatsApp: ~1,200-1,800

## ⚠️ IMPORTANTE

### Antes de eliminar de la BD:
1. **Haz un backup** de las tablas afectadas
2. **Revisa** el archivo `CONTACTOS_SIN_WHATSAPP.json`
3. **Confirma** que no hay contactos importantes

### Backup recomendado:
```sql
-- Crear backup antes de eliminar
CREATE TABLE "Contactos_backup_20250110" AS SELECT * FROM "Contactos";
CREATE TABLE "ClientView_backup_20250110" AS SELECT * FROM "ClientView";
CREATE TABLE "IA_CRM_Clientes_backup_20250110" AS SELECT * FROM "IA_CRM_Clientes";
```

## 🔄 Proceso Alternativo (Manual)

Si prefieres hacerlo manualmente:

1. **Descarga** el resultado de Whapi
2. **Renombra** el archivo a `numeros_con_whatsapp.csv`
3. **Colócalo** en `/workspace/`
4. **Ejecuta**: `python3 limpiar_contactos_sin_whatsapp.py`
5. **Revisa** los archivos generados
6. **Ejecuta** el SQL en tu base de datos

## 📈 Beneficios de la Limpieza

- ✅ **Base de datos más limpia** y eficiente
- ✅ **Ahorro en costos** de mensajería
- ✅ **Mejor tasa de entrega** de mensajes
- ✅ **Métricas más precisas** de engagement
- ✅ **Menos rebotes** en campañas

## 🆘 Soporte

Si algo sale mal:
1. Los contactos eliminados están en `CONTACTOS_SIN_WHATSAPP.json`
2. Puedes restaurar desde el backup
3. El proceso es reversible si tienes los backups

---

**Última actualización**: 2025-01-10
**Total contactos a validar**: 6,048