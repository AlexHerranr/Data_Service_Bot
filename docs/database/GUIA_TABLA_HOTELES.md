# 🏨 GUÍA: Sistema de Reservas con Datos Reales de Beds24

## 📋 **Resumen**

Esta guía documenta cómo se implementó el sistema completo de reservas con **datos 100% reales** extraídos de la API de Beds24, incluyendo:
- ✅ Tabla `HotelApartment` con apartamentos reales
- ✅ Tabla `Booking` con BDStatus automático 
- ✅ Triggers PostgreSQL para actualizaciones en tiempo real

---

## 🗂️ **Estructura Final de la Tabla**

```sql
model HotelApartment {
  id          Int    @id @default(autoincrement())
  propertyId  Int    @map("property_id")      // PropertyId REAL de Beds24
  roomId      Int    @unique @map("room_id")  // RoomId REAL de Beds24
  roomName    String @map("room_name")        // Nombre descriptivo
  capacity    Int    @default(4)              // Capacidad de huéspedes
  extraCharge Json   @map("extra_charge")     // Cargo adicional

  @@map("hotel_apartments")
}
```

---

## 🎯 **Datos Finales (7 apartamentos)**

| RoomId | PropertyId | Nombre | Capacidad | Cargo Extra |
|--------|------------|--------|-----------|-------------|
| 378110 | 173207 | Apartamento 1 Alcoba 2005 A | 6 | $70,000 |
| 378316 | 173307 | Apartamento 1 Alcoba 1820 | 6 | $70,000 |
| 378317 | 173308 | Apartamento 1 Alcoba 1317 | 6 | $70,000 |
| 378321 | 173312 | Apartamento 1 Alcoba 1722 A | 6 | $70,000 |
| 506591 | 240061 | Apartamento 1 Alcoba 0715 | 6 | $70,000 |
| 378318 | 173309 | Aparta Estudio 1722B | 4 | $60,000 |
| 378320 | 173311 | Aparta Estudio 2005 B | 4 | $60,000 |

---

## 🌐 **Endpoints de Beds24 Utilizados**

### ✅ **Endpoints que FUNCIONAN:**

#### 1. **GET /properties** - Obtener Propiedades
```bash
curl -X GET "https://api.beds24.com/v2/properties" \
  -H "Accept: application/json" \
  -H "token: YOUR_TOKEN"
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": 173207,
      "name": "2005 A"
    },
    {
      "id": 173307,
      "name": "1820 "
    }
    // ... más propiedades
  ]
}
```

**✅ Estado:** Funciona perfectamente  
**📊 Uso:** Obtener PropertyIds y nombres reales

---

### ❌ **Endpoints con PROBLEMAS:**

#### 2. **GET /properties/rooms** - Obtener Habitaciones
```bash
curl -X GET "https://api.beds24.com/v2/properties/rooms" \
  -H "Accept: application/json" \
  -H "token: YOUR_TOKEN"
```

**❌ Estado:** Error 500 (Internal Server Error)  
**🐛 Problema:** Servidor de Beds24 devuelve error consistentemente  
**📅 Observado:** Agosto 2025  

**Variaciones probadas (todas fallan):**
```bash
# Con propertyId específico
/properties/rooms?propertyId=173207

# Con parámetros adicionales
/properties/rooms?includeUnitDetails=true&includeTexts=all

# Endpoints alternativos
/rooms
/inventory/rooms
/properties/inventory
```

**💡 Nota:** Según documentación oficial, este endpoint debería devolver:
```json
{
  "success": true,
  "data": [
    {
      "id": 378110,
      "propertyId": 173207,
      "name": "Nombre Real de Habitación",
      "roomType": "apartment",
      "maxPeople": 6,
      "units": [
        {
          "id": 1,
          "name": "Unit Name"
        }
      ]
    }
  ]
}
```

---

## 🔍 **Solución Alternativa: Extracción desde Reservas**

Debido al problema del endpoint `/properties/rooms`, extrajimos los datos reales desde las reservas existentes:

### **Método utilizado:**

1. **Obtener PropertyIds reales:**
   ```typescript
   const properties = await beds24Service.getProperties();
   // ✅ Funcionó: 7 propiedades
   ```

2. **Extraer RoomIds desde reservas:**
   ```typescript
   const bookings = await prisma.booking.findMany({
     where: { raw: { not: null } }
   });
   
   // Extraer roomId y unitId del campo 'raw'
   const roomData = rawData.roomId; // ✅ 378110, 378316, etc.
   ```

3. **Validar consistencia:**
   - ✅ 1,191 reservas analizadas
   - ✅ RoomIds consistentes por propiedad
   - ✅ PropertyIds validados con API

---

## 📊 **Scripts de Implementación**

### **1. Obtener Propiedades (Funciona):**
```bash
BEDS24_TOKEN=xxx npx tsx get-properties-fixed.ts
```

### **2. Verificar RoomIds Reales:**
```bash
npx tsx check-real-room-ids.ts
```

### **3. Crear Tabla Final:**
```bash
npx tsx fix-real-room-ids.ts
```

### **4. Actualizar Cargos:**
```bash
npx tsx update-extra-charges.ts
```

---

## 🚨 **Problemas Conocidos**

### **Error 500 en /properties/rooms**
- **Síntoma:** API devuelve error 500 consistentemente
- **Impacto:** No se pueden obtener nombres oficiales de habitaciones
- **Solución:** Extraer datos desde reservas existentes
- **Status:** Problema del servidor de Beds24 (no nuestro)

### **Timeout en requests largos**
- **Síntoma:** Algunos requests tardan más de 30 segundos
- **Solución:** Usar timeout de 30s y manejar errores gracefully

---

## ✅ **Validación de Datos**

### **PropertyIds - 100% Verificados:**
```typescript
// API Beds24: [173207, 173307, 173308, 173309, 173311, 173312, 240061]
// Nuestra tabla: [173207, 173307, 173308, 173309, 173311, 173312, 240061]
// ✅ Coincidencia: 100%
```

### **RoomIds - Extraídos de 1,191 reservas:**
```typescript
// Ejemplo: Propiedad "2005 A" (173207)
// RoomId en reservas: 378110 (100% consistente)
// RoomId en tabla: 378110 ✅
```

### **Nombres - Basados en PropertyNames reales:**
```typescript
// API Beds24: "2005 A"
// Nuestra tabla: "Apartamento 1 Alcoba 2005 A"
// ✅ Consistente con nomenclatura del negocio
```

---

## 🔄 **Mantenimiento Futuro**

### **Si el endpoint /properties/rooms se arregla:**
1. Actualizar script `get-rooms-with-units.ts`
2. Extraer nombres oficiales de habitaciones
3. Actualizar tabla con nombres reales del campo `"name"`

### **Para agregar nuevas propiedades:**
1. Verificar que aparezcan en `/properties`
2. Obtener reservas de la nueva propiedad
3. Extraer roomId desde el campo `raw`
4. Agregar a la tabla con la nomenclatura establecida

---

## 📞 **Contacto y Soporte**

Si encuentras problemas con la API de Beds24:
1. Verificar que el token tenga permisos correctos
2. Reportar errores 500 al soporte de Beds24
3. Usar la extracción desde reservas como fallback

---

## 🤖 **Sistema BDStatus Automático**

### **📊 Tabla Booking con BDStatus Calculado**

La tabla `Booking` incluye un campo `BDStatus` que se calcula **automáticamente** usando triggers de PostgreSQL:

```sql
model Booking {
  // ... otros campos
  BDStatus      String?   // ✅ Calculado automáticamente
  lastUpdatedBD DateTime  @updatedAt
}
```

### **🎯 Lógica del BDStatus (5 categorías):**

```sql
BDStatus = CASE
  -- 1️⃣ CANCELADAS
  WHEN status = 'cancelled' THEN
    CASE 
      WHEN arrivalDate >= TODAY THEN 'Cancelada Futura'
      ELSE 'Cancelada Pasada'
    END
    
  -- 2️⃣ FECHA FUTURA  
  WHEN arrivalDate >= TODAY THEN
    CASE
      -- 🎯 OTAs siempre confirmadas
      WHEN channel LIKE '%airbnb%' OR channel LIKE '%expedia%' 
      THEN 'Futura Confirmada'
      
      -- Otros canales: confirmed + payments
      WHEN status = 'confirmed' AND payments_count > 0 
      THEN 'Futura Confirmada'
      
      ELSE 'Futura Pendiente'
    END
    
  -- 3️⃣ FECHA PASADA (misma lógica)
  ELSE
    CASE
      WHEN channel LIKE '%airbnb%' OR channel LIKE '%expedia%' 
      THEN 'Pasada Confirmada'
      
      WHEN status = 'confirmed' AND payments_count > 0 
      THEN 'Pasada Confirmada'
      
      ELSE NULL  -- No nos interesa "Pasada Pendiente"
    END
END
```

### **📈 Distribución Actual (1,191 reservas):**

| BDStatus | Cantidad | Descripción |
|----------|----------|-------------|
| Cancelada Pasada | 566 | Reservas canceladas anteriores |
| Pasada Confirmada | 448 | Reservas completadas con pago |
| NULL | 103 | Pasadas pendientes (ignoradas) |
| Futura Confirmada | 40 | Reservas futuras confirmadas |
| Futura Pendiente | 19 | Reservas futuras sin confirmar |
| Cancelada Futura | 15 | Cancelaciones futuras |

### **🚀 Características del Sistema Automático:**

#### ✅ **Trigger PostgreSQL (`calculate_bdstatus`)**
```sql
CREATE TRIGGER update_bdstatus_trigger
  BEFORE INSERT OR UPDATE ON "Booking"
  FOR EACH ROW
  EXECUTE FUNCTION calculate_bdstatus();
```

#### ✅ **Actualización Automática:**
- 🔄 Se ejecuta **dentro de PostgreSQL** (no depende del backend)
- ⚡ **Tiempo real** - inmediato al cambiar datos
- 🌐 **Universal** - funciona desde cualquier fuente: Prisma, N8N, SQL directo
- 🛡️ **Confiable** - sigue funcionando aunque el backend esté caído

#### ✅ **Campos que Disparan el Recálculo:**
- `status` (new, confirmed, cancelled)
- `arrivalDate` (determina futura/pasada)
- `payments` (JSON - determina si está pagado)
- `channel` (detecta OTAs: Airbnb, Expedia)

#### ✅ **Optimización:**
```sql
-- Índice para consultas rápidas por BDStatus
CREATE INDEX idx_booking_bdstatus 
ON "Booking" ("BDStatus") 
WHERE "BDStatus" IS NOT NULL;
```

### **💡 OTAs - Lógica Especial:**

**Airbnb y Expedia** se consideran siempre "Confirmadas" (excepto si están cancelled):
- ✅ Tienen sistemas de pago integrados
- ✅ Mayor confiabilidad que otros canales
- ✅ No requieren verificación de `payments` adicional

### **🔧 Scripts de Implementación:**

```bash
# Implementar trigger automático
npx tsx create-bdstatus-trigger.ts

# Verificar distribución
npx tsx check-booking-tables.ts

# Migrar de VIEW a tabla (ya ejecutado)
npx tsx add-bdstatus-to-booking.ts
```

### **📊 Ventajas vs Sistema Manual:**

| Aspecto | Manual | Automático ✅ |
|---------|--------|---------------|
| Actualización | Script manual | Tiempo real |
| Dependencias | Backend/N8N | Solo PostgreSQL |
| Confiabilidad | Requiere ejecución | Siempre actualizado |
| Performance | Batch updates | Por registro |
| Mantenimiento | Alto | Mínimo |

---

## 🔄 **Consolidación de Tablas**

### **Problema Resuelto: Tablas Duplicadas**

**Antes:**
- ❌ Tabla `Booking` (sin BDStatus automático)
- ❌ VIEW `BookingWithStatus` (con BDStatus calculado)
- 🔀 Duplicidad y confusión

**Después:**
- ✅ Solo tabla `Booking` con BDStatus automático integrado
- ✅ Eliminada VIEW `BookingWithStatus`
- ✅ Una sola fuente de verdad

### **Migración Ejecutada:**
```typescript
// 1. Eliminar VIEW
DROP VIEW IF EXISTS "BookingWithStatus";

// 2. Agregar columna BDStatus a Booking
ALTER TABLE "Booking" ADD COLUMN "BDStatus" TEXT;

// 3. Implementar trigger automático
CREATE TRIGGER update_bdstatus_trigger...

// 4. Recalcular para registros existentes
UPDATE "Booking" SET status = status; -- Dispara trigger
```

---

## 📊 **Sistema de Leads Multi-Fuente**

### **🎯 Tabla Leads - Funcionalidad Completa**

La tabla `Leads` funciona como un **sistema híbrido** que combina leads automáticos de Beds24 con leads manuales de WhatsApp/CRM.

#### **📋 Estructura Optimizada:**

```sql
model Leads {
  id                Int      @id @default(autoincrement())
  bookingId         String?  @unique              // NULL para manuales
  source            String                        // beds24, WhatsApp, CRM
  channel           String?                       // Direct, Booking.com, Directo, Colega
  priority          String   @default("media")    // alta, media, baja
  guestName         String?                       // Nombre cliente
  propertyName      String?                       // Propiedad (2005 A, 1722B, etc.)
  arrivalDate       String                        // Fecha llegada
  departureDate     String?                       // Fecha salida
  totalPersons      Int?                          // Número huéspedes
  numNights         Int?                          // Noches (al lado de personas)
  phone             String                        // Teléfono contacto
  leadNotes         String?                       // Notas específicas (no-Beds24)
  lastUpdatedLeads  DateTime @default(now())      // Última actualización leads
  createdAt         DateTime @default(now())      // Fecha creación
}
```

#### **🤖 Funcionamiento Automático (Beds24):**

```sql
-- Trigger automático en tabla Booking:
-- Si BDStatus = 'Futura Pendiente' → Lead creado automáticamente
-- Si BDStatus ≠ 'Futura Pendiente' → Lead eliminado automáticamente

-- Datos automáticos:
INSERT INTO Leads (
  bookingId, source, channel, priority, guestName, propertyName,
  arrivalDate, departureDate, totalPersons, numNights, phone
) VALUES (
  '73842286', 'beds24', 'Direct', 'alta', 'STIVEN COLEGA', '1722B',
  '2025-08-25', '2025-09-01', 2, 7, 'N/A'
);
```

#### **📱 Inserción Manual (WhatsApp/CRM):**

```typescript
// Desde WhatsApp/ClientView:
await prisma.leads.create({
    data: {
        bookingId: null,                    // Sin booking asociado
        source: 'WhatsApp',                 // Nueva fuente
        channel: 'Directo',                 // O 'Colega'
        priority: 'media',
        guestName: 'Juan Pérez',
        phone: '+57 300 1234567',
        arrivalDate: '2025-09-15',
        totalPersons: 2,
        numNights: 3,
        leadNotes: 'Cliente preguntó por apartamento 1 alcoba. Interesado en septiembre.',
        lastUpdatedLeads: new Date()
    }
});

// Desde CRM:
await prisma.leads.create({
    data: {
        bookingId: null,
        source: 'CRM',
        channel: 'Referido',
        priority: 'alta',
        guestName: 'María García',
        phone: '+57 300 1234567',
        arrivalDate: '2025-10-01',
        totalPersons: 4,
        numNights: 5,
        propertyName: '2005 A',
        leadNotes: 'Referida por Juan Pérez. Cotización enviada. Pendiente respuesta.',
        lastUpdatedLeads: new Date()
    }
});
```

#### **🎯 Tipos de Leads Soportados:**

| Fuente | bookingId | Prioridad | leadNotes | Origen |
|--------|-----------|-----------|-----------|---------|
| **beds24** | Real | alta | NULL | Trigger automático |
| **WhatsApp** | NULL | media | Contexto conversación | Inserción manual |
| **CRM** | NULL | baja/media/alta | Notas seguimiento | Inserción manual |
| **Referidos** | NULL | media | Info referidor | Inserción manual |

#### **🔄 Sincronización Automática:**

```sql
-- TRIGGERS COORDINADOS:

1. calculate_bdstatus() - BEFORE INSERT/UPDATE en Booking
   -- Calcula BDStatus automáticamente (solo si NULL)
   -- Respeta cambios manuales

2. booking_sync_leads() - AFTER INSERT/UPDATE/DELETE en Booking  
   -- Si BDStatus = 'Futura Pendiente' → UPSERT en Leads
   -- Si BDStatus ≠ 'Futura Pendiente' → DELETE en Leads
   -- Si DELETE booking → DELETE lead (CASCADE)
```

#### **📊 Consultas Útiles:**

```sql
-- Leads automáticos (Beds24):
SELECT * FROM "Leads" WHERE source = 'beds24';

-- Leads manuales (WhatsApp/CRM):  
SELECT * FROM "Leads" WHERE "bookingId" IS NULL;

-- Leads de alta prioridad:
SELECT * FROM "Leads" WHERE priority = 'alta' ORDER BY "arrivalDate";

-- Leads con notas (seguimiento requerido):
SELECT "guestName", "leadNotes", source 
FROM "Leads" 
WHERE "leadNotes" IS NOT NULL;

-- Estadísticas por fuente:
SELECT source, priority, COUNT(*) as count
FROM "Leads" 
GROUP BY source, priority
ORDER BY source, priority DESC;
```

#### **✅ Características del Sistema:**

- **🤖 Automático**: Beds24 "Futura Pendiente" ↔ Lead sincronizado
- **📱 Manual**: WhatsApp/CRM con `leadNotes` para contexto  
- **🔄 Tiempo Real**: Triggers automáticos sin latencia
- **📊 Híbrido**: Una tabla para todas las fuentes
- **⚡ Optimizado**: Índices y constraints para performance
- **🛡️ Sin Conflictos**: bookingId único evita duplicados
- **📝 Flexible**: leadNotes para datos no-booking

#### **💡 Uso de leadNotes (ejemplos):**

```text
WhatsApp:
- "Cliente preguntó por apartamento 1 alcoba"
- "Interesado en fechas de diciembre, enviará confirmación"
- "Familia de 4, busca 2 alcobas cerca al mar"

CRM:
- "Referido por Juan Pérez, contacto directo efectivo"  
- "Cotización enviada por email, pendiente respuesta"
- "Cliente VIP, requiere atención personalizada"

Referidos:
- "Recomendado por huésped anterior (booking #12345)"
- "Contacto de redes sociales, primera consulta"
```

#### **🎉 Beneficios del Sistema:**

1. **Unificación**: Todos los leads en una sola tabla
2. **Automatización**: Beds24 sincronizado sin intervención
3. **Flexibilidad**: Soporte para múltiples fuentes
4. **Contexto**: leadNotes para información adicional
5. **Priorización**: Sistema de prioridades automático/manual
6. **Performance**: Optimizado con índices y triggers eficientes
7. **Escalabilidad**: Preparado para futuras fuentes de datos

---

*Documentación actualizada: Agosto 2025*  
*Estado: Hoteles ✅ | BDStatus Automático ✅ | Leads Multi-Fuente ✅ | Endpoints: /properties ✅ | /properties/rooms ❌*