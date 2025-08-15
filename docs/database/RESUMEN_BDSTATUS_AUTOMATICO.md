# 🤖 SISTEMA BDSTATUS: CLASIFICACIÓN AUTOMÁTICA DE RESERVAS

## ✅ SISTEMA AUTOMÁTICO IMPLEMENTADO

**¡AHORA LA BD SÍ CLASIFICA AUTOMÁTICAMENTE!**

Se creó una **vista "BookingWithStatus"** que calcula `BDStatus` en tiempo real usando `CURRENT_DATE` de PostgreSQL.

---

## 🏷️ LÓGICA DE CLASIFICACIÓN

### Función de clasificación implementada:
```javascript
function calculateBDStatus(booking, today) {
  const isFuture = arrivalDate >= today;
  const hasPayments = payments.length > 0;
  const status = booking.status.toLowerCase();
  const channel = booking.channel?.toLowerCase() || '';
  
  // 🎯 REGLA ESPECIAL: OTAs (Airbnb/Expedia)
  const isOTA = channel.includes('airbnb') || channel.includes('expedia');
  
  if (status === 'cancelled') {
    return isFuture ? 'Cancelada Futura' : 'Cancelada Pasada';
  }
  
  if (isFuture) {
    // ✅ Airbnb/Expedia siempre "Futura Confirmada" (sin importar status)
    if (isOTA) {
      return 'Futura Confirmada';
    }
    
    // Para otros canales (Booking.com, Direct, etc.)
    if (status === 'confirmed' && hasPayments) {
      return 'Futura Confirmada';
    } else {
      return 'Futura Pendiente';
    }
  }
  
  // Reservas pasadas
  if (isOTA) {
    return 'Pasada Confirmada'; // OTAs pasadas también confirmadas
  }
  
  if (status === 'confirmed' && hasPayments) {
    return 'Pasada Confirmada';
  } else {
    return 'Pasada Pendiente';
  }
}
```

---

## 📊 CATEGORÍAS Y ESTADÍSTICAS ACTUALES

| Categoría | Cantidad | % | Descripción |
|-----------|----------|---|-------------|
| **Futura Confirmada** | 40 | 3% | OTAs futuras OR (confirmed + payments + fecha futura) |
| **Futura Pendiente** | 19 | 2% | Sin payments O otros status + fecha futura (NO OTAs) |
| **Cancelada Futura** | 15 | 1% | Cancelled + fecha futura |
| **Cancelada Pasada** | 566 | 48% | Cancelled + fecha pasada |
| **Pasada Confirmada** | 448 | 38% | OTAs pasadas OR (confirmed + payments + fecha pasada) |
| **Pasada Pendiente** | 103 | 9% | Sin payments + fecha pasada (NO OTAs) |

**Total: 1,191 reservas clasificadas**

---

## 🎯 REGLAS ESPECIALES

### 📱 OTAs (Online Travel Agencies):
- **Airbnb** (186 reservas): Siempre "Confirmada" sin importar status
- **Expedia** (51 reservas): Siempre "Confirmada" sin importar status

### 🏨 Otros canales:
- **Booking.com** (551 reservas): Requiere status="confirmed" + payments
- **Direct** (398 reservas): Requiere status="confirmed" + payments

---

## 🔄 CAMPOS AUTOMÁTICOS VS CALCULADOS

### ✅ **Automáticos por Prisma** (sin programación):
```prisma
id: @id @default(autoincrement())           // ID secuencial
lastUpdatedBD: @default(now()) @updatedAt   // Timestamp actualización
```

### ⚙️ **Calculados por nuestros scripts**:
```javascript
numNights = Math.ceil((departure - arrival) / días)
propertyName = PROPERTY_MAPPING[propertyId] 
BDStatus = calculateBDStatus(status, arrivalDate, payments, channel, today)
```

---

## 💻 CÓMO USAR EL SISTEMA AUTOMÁTICO

### Para consultas automáticas (recomendado):
```sql
-- Vista con BDStatus calculado automáticamente
SELECT * FROM "BookingWithStatus" WHERE "BDStatus" = 'Futura Confirmada';
```

### En código TypeScript:
```typescript
// Usar la vista para obtener BDStatus automático
const reservasFuturas = await prisma.$queryRaw`
  SELECT * FROM "BookingWithStatus" 
  WHERE "BDStatus" = 'Futura Confirmada'
`;
```

### Ver en Prisma Studio:
```bash
npx prisma studio --port 5558
# Nota: Studio mostrará la tabla Booking con BDStatus manual
# Para ver el automático, usar consultas SQL directas
```

---

## 🔍 VERIFICACIÓN EN TIEMPO REAL

### Ejemplos verificados:

**✅ Airbnb futura:**
- Reserva: 73725186 | Canal: Airbnb
- Status: new | **BDStatus: Futura Confirmada**
- Llegada: 2025-08-31

**✅ Expedia futura:**  
- Reserva: 70607499 | Canal: Expedia
- Status: new | **BDStatus: Futura Confirmada**  
- Llegada: 2025-09-25

---

## 📋 INTEGRACIÓN CON CRM

El campo `BDStatus` permite al CRM automático filtrar y procesar reservas por prioridad:

1. **Futura Confirmada** → Alta prioridad (huéspedes seguros)
2. **Futura Pendiente** → Media prioridad (seguimiento de pagos)
3. **Canceladas** → Baja prioridad (solo histórico)
4. **Pasadas** → Archivo/reportes

---

*Documentación actualizada: Agosto 2025*