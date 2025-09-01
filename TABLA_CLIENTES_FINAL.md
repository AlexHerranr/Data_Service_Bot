# 📊 TABLA CLIENTES - ESTRUCTURA FINAL

## ✅ Migración Completada: 2025-01-10

### 📋 ESTRUCTURA SIMPLIFICADA (11 columnas)

| # | Columna | Tipo | Descripción | Fuente |
|---|---------|------|-------------|--------|
| 1 | `id` | INT | ID autoincremental | Sistema |
| 2 | `telefono` | VARCHAR(50) | Teléfono único | Reservas, Chats, Importación |
| 3 | `nombre` | TEXT | Nombre del cliente | Reservas.guestName, Chats.name |
| 4 | `email` | TEXT | Email del cliente | Reservas.email |
| 5 | `notas` | JSON | Notas multi-fuente | Ver detalle abajo |
| 6 | `etiquetas` | TEXT[] | Etiquetas WhatsApp | Chats.labels |
| 7 | `total_reservas` | INT | Contador de reservas | COUNT(Reservas) |
| 8 | `ultima_actividad` | TIMESTAMP | Última interacción | MAX(fechas) |
| 9 | `estado` | TEXT | Estado actual | Reservas.BDStatus o NULL |
| 10 | `creado_en` | TIMESTAMP | Fecha creación | Sistema |
| 11 | `actualizado_en` | TIMESTAMP | Última modificación | Sistema |

### 📝 ESTRUCTURA DE NOTAS (JSON)

```json
{
  "importacion": "Texto de nota importada del CSV",
  "reservas_notes": "Notas de la reserva",
  "reservas_internal": "Notas internas del equipo",
  "crm_proxima_accion": "Próxima acción a realizar"
}
```

### 📊 ESTADÍSTICAS ACTUALES

- **Total clientes**: 4,608
- **Con notas**: 2,088
  - Notas importadas CSV: 2,087
  - Notas de reservas: 19
  - Notas internas: 11
- **Con reservas**: 34
- **Con estado válido**: 34
- **Sin estado (NULL)**: 4,574 ✅ *Correcto - no tienen reservas*

### 🔄 ALIMENTACIÓN AUTOMÁTICA

#### **ultima_actividad**
Se actualiza con el MAX de:
- `Reservas.modifiedDate`
- `Reservas.lastUpdatedBD`
- `Chats.lastActivity`

#### **estado**
Prioridad de fuentes:
1. `Reservas.BDStatus` (si existe)
2. `CRM.currentStatus` (si existe y no hay reserva)
3. `NULL` (si no hay información)

#### **total_reservas**
- COUNT automático de reservas con el mismo teléfono

### ⚠️ IMPORTANTE: Estados

- **NULL es el valor correcto** cuando no hay reservas ni información en CRM
- NO se asignan estados por defecto como "active" o "activo"
- Solo 34 clientes tienen estado real basado en sus reservas:
  - Pasada Confirmada: 21
  - Futura Confirmada: 9
  - Cancelada Pasada: 4

### 🚀 VENTAJAS DE LA NUEVA ESTRUCTURA

1. **Simplicidad**: De 21 a 11 columnas esenciales
2. **Flexibilidad**: Notas en JSON permiten múltiples fuentes sin crear columnas
3. **Integridad**: Estados reflejan la realidad, no falsos positivos
4. **Performance**: Índices en telefono, estado, ultima_actividad
5. **Escalabilidad**: Fácil agregar nuevas fuentes de notas en el JSON

### 🔧 TRIGGERS ELIMINADOS

Se eliminaron todos los triggers problemáticos que causaban errores con `lastActivity`.
La sincronización futura deberá implementarse con triggers más simples y específicos.

### 📌 NOTAS DE IMPLEMENTACIÓN

- La columna `source` fue eliminada (no era necesaria)
- La vista `contactos_por_fuente` fue eliminada
- Los triggers de sincronización fueron removidos para evitar errores
- La tabla está optimizada para consultas rápidas con índices apropiados

---

*Última actualización: 2025-01-10*