# 🗄️ Guía BD Management - Endpoints CRUD

**Gestión completa de base de datos** - Endpoints para operaciones CRUD en todas las tablas del Bot Data Service con protecciones de seguridad y validaciones.

## 📋 **Resumen**

Los endpoints CRUD permiten **gestión completa** de la base de datos compartida entre Bot WhatsApp y Bot Data Service. Ofrecen acceso directo para testing, debugging y administración de datos.

### **Tablas Gestionadas**
- ✅ **ClientView** - Clientes WhatsApp (phoneNumber como PK) - **2 registros**
- ✅ **Booking** - Reservas Beds24 (id como PK) - **1,191 registros**
- ✅ **Leads** - Prospectos/Leads con CRM avanzado (id como PK) - **19 registros**
- ✅ **hotel_apartments** - Apartamentos (id como PK) - **7 registros**
- ✅ **IA_CMR_Clientes** - Clientes IA/CRM (phoneNumber como PK) - **0 registros**

---

## 🎯 **Arquitectura**

### **Flujo de Datos**
```
API Request → Validación → Mapeo Prisma → Query BD → Response
     ↓            ↓           ↓           ↓         ↓
/api/tables/  → isValid() → clientView → prisma.  → JSON
ClientView                              findMany()
```

### **Mapeo Nombres**
```typescript
// API Endpoint → Modelo Prisma
'ClientView' → 'clientView'           // phoneNumber como PK
'Booking' → 'booking'                // id como PK  
'Leads' → 'leads'                   // id como PK (CRM avanzado)
'hotel_apartments' → 'hotel_apartments'  // id como PK
'IA_CMR_Clientes' → 'iA_CMR_Clientes'   // phoneNumber como PK
```

---

## 🚀 **Endpoints Disponibles**

### **1. GET /api/tables/:tableName**
**Lista registros con paginación y filtros**

```bash
curl "https://dataservicebot-production.up.railway.app/api/tables/ClientView?limit=5&offset=0"
```

**Parámetros Query:**
- `limit` - Máximo registros (default: 50, max: 100)
- `offset` - Offset para paginación (default: 0)
- `{field}` - Filtros por campo (ej. `?name=Alex&phone=573`)

**Response:**
```json
{
  "data": [
    {
      "phoneNumber": "573003913251",
      "name": "Sr Alex",
      "userName": "Usuario",
      "labels": "Colega Jefe/cotización",
      "chatId": "573003913251@s.whatsapp.net",
      "lastActivity": "2025-08-13T20:11:13.997Z"
    }
  ],
  "pagination": {
    "total": 2,
    "limit": 5,
    "offset": 0,
    "hasMore": false
  }
}
```

### **2. GET /api/tables/:tableName/:id**
**Obtener registro específico por ID**

```bash
# ClientView (usa phoneNumber como ID)
curl "https://dataservicebot-production.up.railway.app/api/tables/ClientView/573003913251"

# Booking (usa id numérico)
curl "https://dataservicebot-production.up.railway.app/api/tables/Booking/2818"
```

**Response:**
```json
{
  "phoneNumber": "573003913251",
  "name": "Sr Alex",
  "userName": "Usuario",
  "chatId": "573003913251@s.whatsapp.net"
}
```

### **3. POST /api/tables/:tableName**
**Crear nuevo registro**

```bash
curl -X POST "https://dataservicebot-production.up.railway.app/api/tables/Leads" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+573001234567",
    "guestName": "Test Lead",
    "arrivalDate": "2025-08-20",
    "source": "whatsapp",
    "priority": "alta"
  }'
```

**Response:**
```json
{
  "id": 123,
  "phone": "+573001234567",
  "guestName": "Test Lead",
  "arrivalDate": "2025-08-20",
  "source": "whatsapp",
  "priority": "alta",
  "createdAt": "2025-08-14T23:55:00.000Z"
}
```

### **4. PATCH /api/tables/:tableName/:id**
**Actualizar registro existente**

```bash
curl -X PATCH "https://dataservicebot-production.up.railway.app/api/tables/Leads/123" \
  -H "Content-Type: application/json" \
  -d '{
    "priority": "media",
    "notes": "Contactado por WhatsApp"
  }'
```

### **5. DELETE /api/tables/:tableName/:id**
**Eliminar registro (BLOQUEADO EN PRODUCCIÓN)**

```bash
curl -X DELETE "https://dataservicebot-production.up.railway.app/api/tables/Leads/123"
```

**Response en Producción:**
```json
{
  "error": "DELETE operations are disabled in production for safety",
  "suggestion": "Use PATCH to update status instead of deleting"
}
```

---

## 🔒 **Protecciones de Seguridad**

### **1. Validación de Tablas**
```typescript
const VALID_TABLES = ['ClientView', 'Booking', 'Leads', 'hotel_apartments', 'IA_CMR_Clientes'];

// Request inválido
GET /api/tables/InvalidTable
// Response: 400 Bad Request
{
  "error": "Invalid table name",
  "validTables": ["ClientView", "Booking", "Leads", "hotel_apartments", "IA_CMR_Clientes"]
}
```

### **2. DELETE Bloqueado en Producción**
- ✅ **Desarrollo**: DELETE permitido con logging
- 🚫 **Producción**: DELETE bloqueado automáticamente
- 📝 **Alternativa**: Usar PATCH para cambiar status

### **3. Límites de Paginación**
- **Máximo por request**: 100 registros
- **Default**: 50 registros
- **Protege contra**: Queries que consuman mucha memoria

### **4. Logging de Seguridad**
```typescript
// Todos los intentos DELETE se registran
logger.warn({ tableName, id, action: 'DELETE_BLOCKED' }, '🚫 DELETE blocked in production');
logger.warn({ tableName, id, action: 'DELETE_ATTEMPT' }, '⚠️ DELETE record attempt');
```

---

## 🏗️ **Implementación Técnica**

### **Schema Prisma Simplificado**
```prisma
// Nombres modelo = nombres tabla (sin mapeo confuso)
model ClientView {
  phoneNumber String @id
  name        String?
  userName    String?
  // ... más campos
}

model Booking {
  id          Int    @id @default(autoincrement())
  bookingId   String @unique
  // ... más campos
}
```

### **Mapeo API → Prisma**
```typescript
const TABLE_TO_PRISMA_MODEL: Record<ValidTable, string> = {
  'ClientView': 'clientView',        // camelCase para Prisma
  'Booking': 'booking', 
  'Leads': 'leads',
  'hotel_apartments': 'hotel_apartments'
};

// Uso en código
const prismaModelName = TABLE_TO_PRISMA_MODEL[tableName];
const model = prisma[prismaModelName];
```

### **Ordenación Inteligente**
```typescript
// Diferentes estrategias según tipo de PK
let orderBy: any = { id: 'desc' };  // Numérico: más reciente primero
if (tableName === 'ClientView') {
  orderBy = { phoneNumber: 'asc' }; // String: alfabético
}
```

### **WHERE Clauses Dinámicas**
```typescript
// ClientView usa phoneNumber como PK
if (tableName === 'ClientView') {
  whereClause = { phoneNumber: id };  // String
} else {
  whereClause = { id: parseInt(id) }; // Number
}
```

---

## 🧪 **Testing y Debugging**

### **Testing Manual con curl**
```bash
# 1. Health check
curl "https://dataservicebot-production.up.railway.app/api/health"

# 2. Validación tablas
curl "https://dataservicebot-production.up.railway.app/api/tables/InvalidTable"

# 3. Lista ClientView
curl "https://dataservicebot-production.up.railway.app/api/tables/ClientView?limit=3"

# 4. Booking específico
curl "https://dataservicebot-production.up.railway.app/api/tables/Booking/2818"

# 5. Crear Lead de prueba
curl -X POST "https://dataservicebot-production.up.railway.app/api/tables/Leads" \
  -H "Content-Type: application/json" \
  -d '{"phone": "test", "arrivalDate": "2025-01-01", "source": "test"}'
```

### **Checklist de Pruebas**
- [x] ✅ GET lista registros con paginación
- [x] ✅ GET por ID encuentra registro específico  
- [x] ✅ POST crea nuevo registro
- [x] ✅ PATCH actualiza campos existentes
- [x] 🚫 DELETE bloqueado en producción
- [x] ✅ Validación rechaza tablas inválidas
- [x] ✅ Límites paginación respetados
- [x] ✅ Filtros dinámicos funcionando (ej: `?status=confirmed`)

### **✅ Resultados de Testing en Producción**

**Fecha de Pruebas**: 14 Agosto 2025  
**Environment**: dataservicebot-production.up.railway.app

| Tabla | Estado | Registros | Ejemplo Testing |
|-------|--------|-----------|----------------|
| **ClientView** | ✅ | 2 | `GET /api/tables/ClientView/573003913251` |
| **Booking** | ✅ | 1,191 | `GET /api/tables/Booking?status=confirmed` (562 resultados) |
| **Leads** | ✅ | 19 | CRM avanzado con `leadType`, `estimatedValue`, `assignedTo` |
| **hotel_apartments** | ✅ | 7 | Inventario completo de propiedades |
| **IA_CMR_Clientes** | ✅ | 0 | Tabla funcional, lista para datos IA |

**Protecciones Verificadas**:
- ✅ `DELETE /api/tables/Leads/111` → `403 Forbidden` (bloqueado en producción)
- ✅ `GET /api/tables/InvalidTable` → `400 Bad Request` con lista de tablas válidas
- ✅ Filtros: `?status=confirmed&limit=1` funciona correctamente
- ✅ Paginación: `total: 562` de `1191` reservas confirmadas

### **Logging para Debug**
```typescript
// Activar logs detallados
logger.debug({ tableName, filters, limit, offset }, 'Fetching table data');
logger.debug({ tableName, id }, 'Fetching record by ID');
logger.warn({ tableName, id, action: 'DELETE_BLOCKED' }, '🚫 DELETE blocked');
```

---

## 🎯 **Casos de Uso**

### **1. Admin Panel**
- **Listar clientes**: `GET /api/tables/ClientView?limit=20`
- **Buscar reserva**: `GET /api/tables/Booking/63202946`
- **Ver leads pendientes**: `GET /api/tables/Leads?priority=alta`

### **2. Debugging Bot WhatsApp**
- **Verificar cliente**: `GET /api/tables/ClientView/573001234567`
- **Estado thread**: Revisar `threadId` y `threadTokenCount`
- **Última actividad**: Campo `lastActivity`

### **3. Gestión Reservas**
- **Reservas confirmadas**: `GET /api/tables/Booking?status=confirmed`
- **Por propiedad**: `GET /api/tables/Booking?propertyName=2005 A`
- **Rango fechas**: Implementar filtros personalizados

### **4. Leads Management**
- **Crear lead manualmente**: `POST /api/tables/Leads`
- **Actualizar prioridad**: `PATCH /api/tables/Leads/{id}`
- **CRM avanzado**: Ver campos `leadType`, `estimatedValue`, `assignedTo`, `nextFollowUp`
- **Convertir a reserva**: Lógica business custom

### **5. IA/CRM Automatizado**
- **Gestión IA_CMR_Clientes**: `GET /api/tables/IA_CMR_Clientes`
- **Próxima acción**: Campo `proximaAccion` y `fechaProximaAccion`
- **Priorización**: Campo `prioridad` para orden de contacto
- **Estado perfil**: Campo `profileStatus` para seguimiento

---

## ⚠️ **Consideraciones Importantes**

### **Producción vs Desarrollo**
- **NODE_ENV=production**: DELETE automáticamente bloqueado
- **Desarrollo**: Todas las operaciones permitidas
- **Logs**: Diferentes niveles según ambiente

### **Performance**
- **Límite 100 registros**: Evita queries pesadas
- **Índices BD**: Usar campos indexados para filtros
- **Paginación**: Obligatoria para tablas grandes (>1000 registros)

### **Seguridad**
- **Sin autenticación**: Endpoints públicos (por ahora)
- **Railway Network**: Solo accesible vía Railway URL
- **Logging completo**: Todas las operaciones registradas

### **Datos Sensibles**
- **Raw data**: Campo `raw` contiene respuesta completa Beds24
- **Teléfonos**: Almacenados como strings con formato internacional
- **No eliminar**: Usar soft deletes (campo `status`) en lugar de DELETE

---

## 🔄 **Próximos Pasos**

### **Mejoras Planificadas**
1. **Autenticación API Keys** - Proteger endpoints público
2. **Filtros avanzados** - Búsqueda por rangos fecha, texto
3. **Bulk operations** - Crear/actualizar múltiples registros
4. **Soft deletes** - Campo `deleted_at` en lugar de DELETE
5. **Audit logging** - Tracking de quién hace qué cambios

### **Integraciones**
- **Bot WhatsApp**: Usar endpoints para sync manual
- **Dashboard Admin**: Interface web para gestión
- **Reportes**: Endpoints especializados para analytics
- **Webhooks salientes**: Notificar cambios a otros sistemas

---

## 📚 **Referencias**

- **[Prisma Docs](https://www.prisma.io/docs)** - ORM utilizado
- **[Express Routing](https://expressjs.com/en/guide/routing.html)** - Framework web
- **[Railway Deploy](https://docs.railway.app/)** - Platform hosting
- **[Índice Documentación](INDICE_DOCUMENTACION.md)** - Todas las guías

**🤖 Generated with [Claude Code](https://claude.ai/code)**