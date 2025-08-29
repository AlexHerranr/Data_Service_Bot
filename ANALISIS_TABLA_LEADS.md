# 📊 Análisis Completo de la Tabla de Leads

## 🎯 Resumen Ejecutivo

La tabla `Leads` es una tabla derivada que se sincroniza automáticamente desde la tabla `Booking` mediante triggers de PostgreSQL. Su propósito es mantener un registro de todas las reservas pendientes de confirmación (estado "Futura Pendiente") para facilitar el seguimiento comercial.

## 📋 Estructura Actual de la Tabla

### Modelo en Prisma (`prisma/schema.prisma`)

```prisma
model Leads {
  id               Int       @id @default(autoincrement())
  bookingId        String?   @unique
  phone            String
  guestName        String?
  propertyName     String?
  arrivalDate      String
  departureDate    String?
  totalPersons     Int?
  source           String
  channel          String?
  priority         String    @default("media")
  notes            String?
  createdAt        DateTime  @default(now())
  lastUpdatedLeads DateTime  @default(now())
  numNights        Int?
  estimatedValue   String?
  assignedTo       String?
  lastContactAt    DateTime?
  nextFollowUp     DateTime?
  lastUpdated      DateTime  @default(now())

  @@index([arrivalDate])
  @@index([phone])
  @@index([priority])
  @@index([source])
  @@index([arrivalDate], map: "idx_Leads_arrivalDate")
  @@index([phone], map: "idx_Leads_phone")
  @@index([assignedTo])
  @@index([lastContactAt])
  @@index([nextFollowUp])
}
```

### Campos Clave

1. **Campos de Identificación**:
   - `id`: PK autoincremental
   - `bookingId`: Unique, referencia a la reserva original

2. **Campos de Información del Lead**:
   - `phone`: Teléfono del cliente
   - `guestName`: Nombre del huésped
   - `propertyName`: Propiedad reservada
   - `arrivalDate`: Fecha de llegada
   - `departureDate`: Fecha de salida
   - `totalPersons`: Número de personas
   - `numNights`: Número de noches

3. **Campos de Origen y Canal**:
   - `source`: Siempre "beds24" (hardcoded en trigger)
   - `channel`: Canal de reserva (Direct, Booking.com, etc.)

4. **Campos de Gestión** (muchos no se usan actualmente):
   - `priority`: Prioridad (default "media")
   - `assignedTo`: Asignado a (no se usa)
   - `lastContactAt`: Último contacto (no se usa)
   - `nextFollowUp`: Próximo seguimiento (no se usa)
   - `estimatedValue`: Valor estimado (no se usa)

5. **Campos de Auditoría**:
   - `createdAt`: Fecha de creación
   - `lastUpdatedLeads`: Última actualización específica de Leads
   - `lastUpdated`: Última actualización general

## 🔄 Flujo de Sincronización

### 1. Origen de Datos

```
Beds24 API → data-sync → Tabla Booking → Trigger → Tabla Leads
```

### 2. Trigger Principal: `booking_sync_leads()`

**Ubicación**: Función PostgreSQL en la base de datos

**Lógica**:
```sql
IF NEW."BDStatus" = 'Futura Pendiente' THEN
  -- Inserta o actualiza en Leads
  INSERT INTO "Leads" (...) 
  ON CONFLICT ("bookingId") DO UPDATE SET ...
ELSE
  -- Elimina de Leads si existe
  DELETE FROM "Leads" WHERE "bookingId" = NEW."bookingId"
END IF
```

### 3. Triggers Configurados

1. **`trg_Booking_sync_leads`**
   - Evento: AFTER INSERT OR UPDATE
   - Columnas monitoreadas: BDStatus, guestName, propertyName, arrivalDate, departureDate, totalPersons, channel, lastUpdatedBD
   - Acción: Sincroniza con tabla Leads

2. **`trg_Booking_delete_sync_leads`**
   - Evento: AFTER DELETE
   - Acción: Elimina el lead correspondiente

## 🔍 Análisis del Código

### 1. Sincronización desde Beds24 (`data-sync/src/providers/beds24/sync.ts`)

```typescript
// La sincronización ocurre automáticamente via trigger
// cuando se inserta/actualiza una reserva con BDStatus = 'Futura Pendiente'
```

- El código NO maneja directamente la tabla Leads
- Todo se delega al trigger de PostgreSQL
- El trigger se ejecuta automáticamente cuando:
  - Se crea una nueva reserva
  - Se actualiza el BDStatus de una reserva
  - Se eliminan reservas

### 2. API de Consulta (`data-sync/src/server/routes/tables.route.ts`)

- La tabla Leads está expuesta como endpoint API
- Permite consultas con filtros y paginación
- Ruta: `/api/tables/Leads`

### 3. Scripts de Migración

Se han ejecutado varios scripts de optimización:

1. **`optimize-leads-table.ts`**: 
   - Elimina campos innecesarios (assignedTo, lastContactAt, nextFollowUp, leadType, estimatedValue)
   - Agrega campo numNights
   - Actualiza función de sincronización

2. **`setup-leads-sync-trigger.ts`**:
   - Configura triggers automáticos
   - Establece constraints y foreign keys
   - Crea índices de optimización

3. **`remove-leadtype-constraint.ts`**:
   - Resuelve problema con campo obsoleto leadType
   - Elimina constraints problemáticos

## ⚠️ Problemas Identificados

### 1. Campos No Utilizados
Varios campos en el modelo no se están usando:
- `assignedTo`
- `lastContactAt`
- `nextFollowUp`
- `estimatedValue`
- `notes`

### 2. Índices Duplicados
Hay índices duplicados en el schema:
- `@@index([arrivalDate])` 
- `@@index([arrivalDate], map: "idx_Leads_arrivalDate")`
- `@@index([phone])`
- `@@index([phone], map: "idx_Leads_phone")`

### 3. Campo `leadType` Obsoleto
- Fue eliminado de la función pero puede existir en el schema
- Causaba errores de constraint violation

### 4. Dependencia Total del Trigger
- No hay lógica de negocio en el código de aplicación
- Todo depende del trigger de PostgreSQL
- Dificulta testing y debugging

## 🚀 Oportunidades de Optimización

### 1. Limpieza del Schema
```prisma
model Leads {
  id               Int       @id @default(autoincrement())
  bookingId        String    @unique
  phone            String
  guestName        String?
  propertyName     String?
  arrivalDate      String
  departureDate    String?
  totalPersons     Int?
  numNights        Int?
  source           String    @default("beds24")
  channel          String?
  priority         String    @default("media")
  createdAt        DateTime  @default(now())
  lastUpdated      DateTime  @updatedAt

  @@index([arrivalDate])
  @@index([phone])
  @@index([priority])
  @@index([channel])
}
```

### 2. Mejorar Tipos de Datos
- Cambiar `arrivalDate` y `departureDate` de String a DateTime
- Cambiar `estimatedValue` de String a Decimal (si se decide mantener)

### 3. Agregar Validaciones
- Validar que `departureDate` > `arrivalDate`
- Validar formato de teléfono
- Calcular automáticamente `numNights`

### 4. Optimización de Índices
- Eliminar índices duplicados
- Agregar índice compuesto para queries comunes:
  ```sql
  @@index([propertyName, arrivalDate])
  @@index([channel, priority])
  ```

### 5. Mejorar el Trigger
- Agregar logging dentro del trigger
- Manejar errores más elegantemente
- Considerar usar NOTIFY para eventos en tiempo real

### 6. Agregar Lógica de Negocio
- Calcular prioridad automáticamente basado en:
  - Valor de la reserva
  - Proximidad de la fecha
  - Canal de origen
  - Historial del cliente

### 7. Implementar Soft Delete
- En lugar de eliminar físicamente, marcar como inactivo
- Mantener historial de leads

### 8. Agregar Métricas
- Tiempo de conversión (lead → confirmado)
- Tasa de conversión por canal
- Valor promedio por lead

## 📊 Estadísticas Actuales

Basado en el análisis del código:

- **Fuente de datos**: 100% desde Beds24
- **Sincronización**: Automática via triggers PostgreSQL
- **Estados que generan leads**: Solo "Futura Pendiente"
- **Campos activamente utilizados**: ~60% del schema
- **Índices**: 9 índices (algunos duplicados)

## 🎯 Recomendaciones Prioritarias

1. **URGENTE**: Limpiar el schema de Prisma eliminando campos no utilizados
2. **ALTO**: Resolver índices duplicados
3. **MEDIO**: Mejorar tipos de datos (fechas como DateTime)
4. **MEDIO**: Agregar lógica de cálculo de prioridad
5. **BAJO**: Implementar métricas y analytics

## 🔧 Próximos Pasos

1. Actualizar schema de Prisma con estructura optimizada
2. Crear nueva migración para aplicar cambios
3. Actualizar trigger para manejar nuevos campos
4. Implementar lógica de priorización
5. Agregar tests unitarios
6. Documentar API de consulta
7. Implementar dashboard de métricas

## 📝 Notas Técnicas

- La tabla usa triggers PostgreSQL para sincronización automática
- No hay foreign key constraint con Booking (solo unique en bookingId)
- El campo `source` siempre es "beds24" (hardcoded)
- La sincronización es unidireccional: Booking → Leads
- No hay API para modificar Leads directamente (solo lectura)