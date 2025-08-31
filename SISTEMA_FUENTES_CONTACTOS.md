# 📊 SISTEMA DE FUENTES EN CONTACTOS

## 🎯 Objetivo
Rastrear el origen de cada contacto para entender de dónde vienen los clientes y optimizar las estrategias de marketing y ventas.

## 📝 Campo `source` en la tabla Contactos

### Tipo de dato
- **Array de strings** (`String[]`)
- Permite múltiples fuentes por contacto
- Acumulativo (un contacto puede venir de varias fuentes)

## 🏷️ Fuentes Principales

### 1. **booking** 
- Contacto que hizo una reserva
- Sub-fuentes por canal:
  - `booking_airbnb` - Reservas de Airbnb
  - `booking_booking.com` - Reservas de Booking.com
  - `booking_direct` - Reservas directas
  - `booking_expedia` - Reservas de Expedia

### 2. **whatsapp**
- Contacto activo en WhatsApp
- Sub-fuentes:
  - `clientview` - Sincronizado desde ClientView
  - `whatsapp_chat` - Chat activo

### 3. **google_contacts**
- Importado desde Google Contacts
- Sub-fuentes:
  - `google_import_YYYY-MM-DD` - Fecha de importación

### 4. **imported**
- Importado manualmente (CSV, Excel, etc.)
- Sub-fuentes:
  - `whapi_validated` - Validado por Whapi
  - `import_YYYY-MM-DD` - Fecha de importación

## 🔄 Sincronización Automática

### Desde Booking → Contactos
```sql
-- Trigger automático cuando se crea/actualiza una reserva
-- Agrega fuentes: ['booking', 'booking_[canal]', 'import_YYYY-MM-DD']
```

### Desde ClientView → Contactos
```sql
-- Trigger automático cuando hay actividad en WhatsApp
-- Agrega fuentes: ['whatsapp', 'clientview', 'sync_YYYY-MM-DD']
```

### Desde Google Contacts → Contactos
```javascript
// Script de sincronización
// Agrega fuentes: ['google_contacts', 'google_import_YYYY-MM-DD']
```

## 📈 Análisis de Fuentes

### Vista SQL: `contactos_por_fuente`
```sql
SELECT * FROM contactos_por_fuente;
```

Muestra:
- `Booking + WhatsApp` - Clientes con reserva y WhatsApp
- `Solo Booking` - Solo tienen reserva
- `Solo WhatsApp` - Solo chat de WhatsApp
- `Solo Google` - Solo en Google Contacts
- `Importado Manual` - Importados por CSV/Excel

### Función: `get_source_stats()`
```sql
SELECT * FROM get_source_stats();
```

Estadísticas por fuente:
- Total de contactos
- Con WhatsApp activo
- Sin WhatsApp
- Con email
- Activos últimos 30 días

## 🎯 Casos de Uso

### 1. Marketing Segmentado
```sql
-- Contactos que reservaron pero no tienen WhatsApp
SELECT * FROM "Contactos" 
WHERE 'booking' = ANY(source) 
AND "hasWhatsapp" = false;
```

### 2. Clientes VIP (Multi-canal)
```sql
-- Contactos presentes en múltiples fuentes
SELECT * FROM "Contactos" 
WHERE array_length(source, 1) >= 3;
```

### 3. Análisis por Canal de Reserva
```sql
-- Distribución por canal de booking
SELECT 
  CASE 
    WHEN 'booking_airbnb' = ANY(source) THEN 'Airbnb'
    WHEN 'booking_booking.com' = ANY(source) THEN 'Booking.com'
    ELSE 'Directo'
  END as canal,
  COUNT(*) as total
FROM "Contactos"
WHERE 'booking' = ANY(source)
GROUP BY canal;
```

### 4. Contactos Huérfanos
```sql
-- Contactos sin fuente clara (requieren investigación)
SELECT * FROM "Contactos" 
WHERE array_length(source, 1) = 0 
OR source IS NULL;
```

## 📊 Métricas Actuales (10/01/2025)

Basado en los 4,608 contactos validados:

| Fuente | Cantidad | Porcentaje |
|--------|----------|------------|
| Solo Importado | ~3,500 | ~76% |
| Booking + WhatsApp | ~600 | ~13% |
| Solo Booking | ~300 | ~6.5% |
| Solo WhatsApp | ~200 | ~4.5% |

## 🔮 Futuras Fuentes

Preparado para agregar:
- `facebook` - Facebook Messenger
- `instagram` - Instagram Direct
- `email_campaign` - Campañas de email
- `referral` - Referencias
- `website` - Formulario web
- `phone_call` - Llamadas telefónicas

## 💡 Beneficios del Sistema

1. **Trazabilidad completa** del origen de cada contacto
2. **ROI por canal** - Saber qué canales traen más clientes
3. **Segmentación inteligente** para marketing
4. **Detección de clientes multi-canal** (más valiosos)
5. **Limpieza de datos** - Identificar contactos huérfanos
6. **Análisis histórico** - Ver evolución de fuentes en el tiempo

## 🛠️ Mantenimiento

### Actualizar fuentes manualmente
```sql
UPDATE "Contactos" 
SET source = source || ARRAY['nueva_fuente']
WHERE "phoneNumber" = '+573001234567';
```

### Limpiar fuentes duplicadas
```sql
UPDATE "Contactos" 
SET source = ARRAY(SELECT DISTINCT unnest(source));
```

### Auditoría de fuentes
```sql
-- Ver todos los valores únicos de fuentes
SELECT DISTINCT unnest(source) as fuente, COUNT(*) 
FROM "Contactos" 
GROUP BY fuente 
ORDER BY COUNT(*) DESC;
```