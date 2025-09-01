# 📊 Análisis de la Tabla Booking - BD vs Bot

## 🗂️ Estructura Actual de la Tabla Booking

```sql
model Booking {
  id            Int      @id @default(autoincrement())
  bookingId     String   @unique
  phone         String?
  guestName     String?
  status        String?
  internalNotes String?
  propertyName  String?
  arrivalDate   String?
  departureDate String?
  numNights     Int?
  totalPersons  Int?
  totalCharges  String?
  totalPayments String?
  balance       String?
  basePrice     String?
  channel       String?
  email         String?
  apiReference  String?
  charges       Json     @default("[]")
  payments      Json     @default("[]")
  messages      Json     @default("[]")
  infoItems     Json     @default("[]")
  notes         String?
  bookingDate   String?
  modifiedDate  String?
  lastUpdatedBD DateTime @default(now())
  raw           Json?
  BDStatus      String?
}
```

## 🤖 Cómo el Bot Llena los Campos

### ✅ Campos Correctamente Mapeados:

| Campo BD | Fuente Beds24 | Mapeo en Bot | Observaciones |
|----------|---------------|--------------|---------------|
| `bookingId` | `bookingData.bookingId` o `bookingData.id` | ✅ Correcto | Identificador único |
| `phone` | `bookingData.phone` o `bookingData.guestPhone` | ✅ Con fallbacks | Extrae de múltiples fuentes |
| `guestName` | `firstName + lastName` | ✅ Con combinación | Maneja diferentes formatos |
| `status` | `bookingData.status` | ✅ Correcto | new, confirmed, cancelled |
| `arrivalDate` | `bookingData.arrival` | ✅ Formateado | Formato YYYY-MM-DD |
| `departureDate` | `bookingData.departure` | ✅ Formateado | Formato YYYY-MM-DD |
| `numNights` | Calculado | ✅ Correcto | `calculateNights()` |
| `totalPersons` | `numAdult + numChild` | ✅ Calculado | Suma adultos y niños |
| `channel` | `bookingData.channel` | ✅ Con mapeo | airbnb, booking, direct |
| `email` | `bookingData.email` | ✅ Con fallbacks | Múltiples fuentes |
| `apiReference` | `bookingData.apiReference` | ✅ Correcto | ID de OTA |
| `messages` | `bookingData.messages[]` | ✅ Array JSON | Chat completo |
| `raw` | `bookingData` completo | ✅ Correcto | Respaldo completo |

### ⚠️ Campos con Posibles Problemas:

| Campo BD | Problema | Solución Recomendada |
|----------|----------|---------------------|
| `totalCharges` | String en BD, number en cálculo | ⚠️ Convertir a Decimal |
| `totalPayments` | String en BD, number en cálculo | ⚠️ Convertir a Decimal |
| `balance` | String en BD, number en cálculo | ⚠️ Convertir a Decimal |
| `basePrice` | String nullable | ⚠️ Convertir a Decimal |
| `internalNotes` | Combina múltiples fuentes | ✅ OK pero revisar formato |
| `propertyName` | Mapeo por ID | ⚠️ Verificar mapeo completo |
| `BDStatus` | Campo custom | ✅ OK pero documentar valores |

### 🔍 Campos JSON Detallados:

#### 1. **charges** (Array JSON)
```javascript
[
  {
    type: "charge",
    description: "[ROOMNAME1] [FIRSTNIGHT] - [LEAVINGDAY]",
    amount: 616357
  },
  {
    type: "charge",
    description: "Cargo Registro / Aseo",
    amount: 70000
  }
]
```

#### 2. **payments** (Array JSON)
```javascript
[
  {
    type: "payment",
    description: "Pago hecho por huésped",
    amount: -760000
  }
]
```

#### 3. **messages** (Array JSON)
```javascript
[
  {
    id: 113333944,
    message: "Hello Alexander! My flight arrives at 6am...",
    time: "2025-08-16T22:32:37Z",
    source: "guest",  // o "host"
    read: false
  }
]
```

#### 4. **infoItems** (Array JSON)
```javascript
[
  {
    bookingId: 74385357,
    code: "BOOKINGCOMFLAG",
    text: "booker is genius"
  }
]
```

## 🚨 Problemas Identificados:

### 1. **Tipos de Datos Monetarios**
- **Problema**: Los campos monetarios están como `String?` en la BD
- **Impacto**: Dificulta cálculos y agregaciones
- **Solución**: Migrar a tipo `Decimal` o `Float`

### 2. **Fechas como Strings**
- **Problema**: `arrivalDate`, `departureDate`, `bookingDate`, `modifiedDate` son strings
- **Impacto**: Dificulta queries por rango de fechas
- **Solución**: Considerar migrar a `DateTime`

### 3. **Índices**
La tabla tiene buenos índices:
- ✅ Por `bookingId` (único)
- ✅ Por `arrivalDate` y `departureDate`
- ✅ Por `phone` y `guestName`
- ✅ Por `status` y `channel`
- ✅ Compuesto por `propertyName, departureDate`

### 4. **Campos Faltantes Potenciales**
Campos que podrían ser útiles pero no están:
- `roomId` - ID de la habitación
- `propertyId` - ID numérico de la propiedad
- `commission` - Comisión de OTA
- `cancelTime` - Timestamp de cancelación
- `checkInTime` - Hora de check-in
- `checkOutTime` - Hora de check-out
- `specialRequests` - Peticiones especiales
- `guestCountry` - País del huésped

## 📋 Recomendaciones:

### 1. **Migración de Tipos de Datos** (Prioridad Alta)
```prisma
model Booking {
  // Cambiar de String a Decimal
  totalCharges  Decimal  @db.Decimal(10, 2)
  totalPayments Decimal  @db.Decimal(10, 2)
  balance       Decimal  @db.Decimal(10, 2)
  basePrice     Decimal? @db.Decimal(10, 2)
  
  // Cambiar de String a DateTime
  arrivalDate   DateTime
  departureDate DateTime
  bookingDate   DateTime?
  modifiedDate  DateTime?
}
```

### 2. **Agregar Campos Faltantes** (Prioridad Media)
```prisma
model Booking {
  // Nuevos campos sugeridos
  roomId        Int?
  propertyId    Int?
  commission    Decimal? @db.Decimal(10, 2)
  cancelTime    DateTime?
  checkInTime   String?
  checkOutTime  String?
  guestCountry  String?
}
```

### 3. **Validaciones en el Bot** (Prioridad Alta)
```typescript
// Validar antes de guardar
const validateBookingData = (data: any) => {
  // Validar que los montos sean números
  if (isNaN(data.totalCharges)) {
    logger.warn('Invalid totalCharges', data.totalCharges);
    data.totalCharges = 0;
  }
  
  // Validar fechas
  if (!isValidDate(data.arrivalDate)) {
    throw new Error('Invalid arrival date');
  }
  
  // Validar phone
  if (!data.phone || data.phone === 'unknown') {
    logger.warn('Missing phone number for booking', data.bookingId);
  }
  
  return data;
};
```

### 4. **Triggers o Funciones en BD** (Prioridad Baja)
Considerar agregar:
- Trigger para actualizar `lastUpdatedBD` automáticamente
- Función para calcular `balance` = `totalCharges` - `totalPayments`
- Check constraint para `arrivalDate` < `departureDate`

## 🔄 Script de Migración Sugerido:

```sql
-- 1. Agregar nuevas columnas temporales
ALTER TABLE "Booking" 
ADD COLUMN "totalCharges_new" DECIMAL(10,2),
ADD COLUMN "totalPayments_new" DECIMAL(10,2),
ADD COLUMN "balance_new" DECIMAL(10,2),
ADD COLUMN "basePrice_new" DECIMAL(10,2);

-- 2. Migrar datos existentes
UPDATE "Booking" 
SET 
  "totalCharges_new" = CAST(NULLIF("totalCharges", '') AS DECIMAL),
  "totalPayments_new" = CAST(NULLIF("totalPayments", '') AS DECIMAL),
  "balance_new" = CAST(NULLIF("balance", '') AS DECIMAL),
  "basePrice_new" = CAST(NULLIF("basePrice", '') AS DECIMAL);

-- 3. Renombrar columnas (después de verificar)
-- ALTER TABLE "Booking" DROP COLUMN "totalCharges";
-- ALTER TABLE "Booking" RENAME COLUMN "totalCharges_new" TO "totalCharges";
-- etc...
```

## ✅ Conclusiones:

1. **El mapeo actual funciona** pero puede mejorarse
2. **Los tipos de datos monetarios** necesitan migración urgente
3. **Los mensajes se guardan correctamente** como JSON
4. **El campo `raw`** es excelente para debugging
5. **Faltan algunos campos útiles** pero no críticos
6. **Los índices están bien configurados** para las queries comunes

## 🎯 Acciones Inmediatas:

1. ✅ El bot ya maneja bien los datos de Beds24
2. ⚠️ Planificar migración de tipos de datos monetarios
3. ⚠️ Agregar validaciones adicionales en el bot
4. 📝 Documentar los valores posibles de `BDStatus` y `status`
5. 🔍 Revisar el mapeo de `propertyId` → `propertyName`