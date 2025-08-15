# 📋 Checklist de Funcionalidades y Pruebas - Bot Data Service

## 📜 Resumen
Este documento sirve como checklist completo para las funcionalidades clave que debe implementar el Bot Data Service. Incluye una lista priorizada de características, descripción detallada de cada una, y pruebas requeridas para validar su implementación.

**Priorización**:
- 🔥 **PRIMERO**: Acceso y manipulación de Base de Datos
- 🏨 **SEGUNDO**: Integración con Beds24 API  
- 📱 **TERCERO**: Integración con Whapi API
- ⚡ **EXTRAS**: Funcionalidades avanzadas

---

## 1. 🗄️ GESTIÓN DE BASE DE DATOS (PRIORIDAD ALTA)

### 1.1 Acceso y Lectura de Tablas
- **Descripción**: Leer datos de cualquier tabla (WhatsApp, Reservas, Prospectos, Apartamentos)
- **Endpoint**: `GET /api/tables/:tableName`
- **Query Params**: `?filter=campo:valor&limit=50&offset=0`
- **Requisitos Técnicos**: 
  - Usar Prisma para queries
  - Soporte para filtros dinámicos
  - Paginación
  - Validación de nombres de tabla

**Pruebas Requeridas**:
- ✅ Unit: Mock Prisma.findMany, verificar query
- ✅ Integration: Leer tabla real con filtros
- ✅ Error: Tabla inexistente → 404
- ✅ Error: Query inválida → 400
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

### 1.2 Edición de Filas (UPDATE)
- **Descripción**: Modificar una fila existente por ID
- **Endpoint**: `PATCH /api/tables/:tableName/:id`
- **Body**: `{ "campo": "nuevo_valor" }`
- **Requisitos Técnicos**:
  - Usar Prisma.update
  - Validación de datos con Zod
  - Solo actualizar campos enviados

**Pruebas Requeridas**:
- ✅ Unit: Mock update, verificar datos
- ✅ Integration: Actualizar y confirmar cambios
- ✅ Error: ID inexistente → 404
- ✅ Error: Datos inválidos → 400
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

### 1.3 Creación de Filas (INSERT)
- **Descripción**: Agregar nueva fila
- **Endpoint**: `POST /api/tables/:tableName`
- **Body**: Objeto JSON completo
- **Requisitos Técnicos**:
  - Usar Prisma.create
  - Validación completa de campos requeridos
  - Manejo de IDs auto-incrementales

**Pruebas Requeridas**:
- ✅ Unit: Mock create, verificar ID generado
- ✅ Integration: Crear y verificar existencia
- ✅ Error: Campos requeridos faltantes → 400
- ✅ Error: Constraint violations → 409
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

### 1.4 Eliminación de Filas (DELETE)
- **Descripción**: Borrar fila por ID
- **Endpoint**: `DELETE /api/tables/:tableName/:id`
- **Requisitos Técnicos**:
  - Usar Prisma.delete
  - Verificar existencia antes de borrar
  - Manejo de foreign keys

**Pruebas Requeridas**:
- ✅ Unit: Mock delete, verificar eliminación
- ✅ Integration: Crear, borrar, confirmar ausencia
- ✅ Error: ID inexistente → 404
- ✅ Error: Referencias FK → 409
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

### 1.5 Gestión de Esquema (ALTER TABLE)
- **Descripción**: Agregar/modificar columnas
- **Endpoint**: `POST /api/admin/schema/alter` (Admin only)
- **Body**: `{ "table": "tabla", "action": "add_column", "column": {...} }`
- **Requisitos Técnicos**:
  - Usar Prisma migrations
  - Solo para admin con autenticación
  - Backup automático antes de cambios

**Pruebas Requeridas**:
- ✅ Manual: Ejecutar migration, verificar schema
- ✅ Integration: Agregar columna, insertar datos
- ✅ Error: Migration conflict → rollback
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

## 2. 🏨 INTEGRACIÓN BEDS24 API

### 2.1 Obtener Reservas
- **Descripción**: Fetch reservas por ID, fechas o propiedad
- **Endpoint**: `GET /api/beds24/bookings`
- **Query Params**: `?bookingId=123&dateFrom=2025-01-01&dateTo=2025-12-31`
- **Requisitos Técnicos**: Usar Beds24Client.getBookings

**Pruebas Requeridas**:
- ✅ Unit: Mock API response, verificar parsing
- ✅ Integration: Llamar API real, validar datos
- ✅ Error: Token inválido → 401
- ✅ Error: Rate limit → retry con backoff
- **Estado**: [x] Implementado (en sync.ts)

---

### 2.2 Actualizar Reservas
- **Descripción**: Modificar detalles de reserva
- **Endpoint**: `PATCH /api/beds24/bookings/:id`
- **Body**: `{ "notes": "nueva nota", "status": "confirmed" }`
- **Requisitos Técnicos**: Usar Beds24Client.updateBooking

**Pruebas Requeridas**:
- ✅ Unit: Mock update, verificar payload
- ✅ Integration: Actualizar reserva test
- ✅ Error: ID inválido → 404
- ✅ Error: Permisos → 403
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

### 2.3 Obtener Disponibilidad
- **Descripción**: Consultar disponibilidad de propiedades
- **Endpoint**: `GET /api/beds24/availability`
- **Query Params**: `?propertyId=123&dateFrom=2025-01-01&dateTo=2025-01-31`
- **Requisitos Técnicos**: Usar Beds24Client.getAvailability

**Pruebas Requeridas**:
- ✅ Unit: Mock response, parsear slots
- ✅ Integration: Query real, validar datos
- ✅ Error: Fechas inválidas → 400
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

### 2.4 Cancelaciones
- **Descripción**: Cancelar reserva
- **Endpoint**: `DELETE /api/beds24/bookings/:id`
- **Requisitos Técnicos**: Cambiar status a "cancelled"

**Pruebas Requeridas**:
- ✅ Unit: Mock cancel, verificar status
- ✅ Integration: Crear reserva test, cancelar
- ✅ Error: Post-checkin → 403
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

## 3. 📱 INTEGRACIÓN WHAPI API

### 3.1 Enviar Mensajes
- **Descripción**: Enviar texto/media a chats WhatsApp
- **Endpoint**: `POST /api/whapi/messages`
- **Body**: `{ "to": "chatId", "body": "mensaje", "type": "text" }`
- **Requisitos Técnicos**: Usar WhapiClient.sendMessage

**Pruebas Requeridas**:
- ✅ Unit: Mock send, verificar payload
- ✅ Integration: Enviar mensaje test
- ✅ Error: ChatId inválido → 400
- ✅ Error: Rate limit → retry
- **Estado**: [x] Implementado (parcial)

---

### 3.2 Enviar Indicadores
- **Descripción**: Typing/recording indicators
- **Endpoint**: `PUT /api/whapi/presence/:chatId`
- **Body**: `{ "presence": "typing" }`

**Pruebas Requeridas**:
- ✅ Unit: Mock presence, verificar delay
- ✅ Integration: Enviar indicator, observar
- ✅ Error: Presence inválida → 400
- **Estado**: [x] Implementado

---

### 3.3 Info de Chats
- **Descripción**: Obtener detalles de chat
- **Endpoint**: `GET /api/whapi/chats/:chatId`
- **Requisitos Técnicos**: Fetch labels, nombres, etc.

**Pruebas Requeridas**:
- ✅ Unit: Mock response, parsear labels
- ✅ Integration: Query chat real
- ✅ Error: Chat no encontrado → 404
- **Estado**: [x] Implementado

---

### 3.4 Manejo de Media
- **Descripción**: Upload/download archivos
- **Endpoint**: `POST /api/whapi/media`
- **Body**: `{ "media": "base64_data", "type": "image" }`

**Pruebas Requeridas**:
- ✅ Unit: Mock upload, verificar base64
- ✅ Integration: Subir/descargar archivo
- ✅ Error: Formato inválido → 415
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

## 4. ⚡ FUNCIONALIDADES AVANZADAS

### 4.1 Procesamiento de Webhooks
- **Descripción**: Recibir webhooks de Beds24/Whapi
- **Endpoints**: `POST /api/webhooks/:source`
- **Requisitos Técnicos**: Encolar jobs en BullMQ

**Pruebas Requeridas**:
- ✅ Unit: Mock webhook, verificar encolado
- ✅ Integration: Simular con curl
- ✅ Error: Payload inválido → 400
- **Estado**: [x] Implementado

---

### 4.2 Manejo de Colas
- **Descripción**: Procesar jobs asíncronos
- **Requisitos Técnicos**: BullMQ con Redis

**Pruebas Requeridas**:
- ✅ Unit: Mock job add/process
- ✅ Integration: Encolar y procesar
- ✅ Error: Job fail → DLQ
- **Estado**: [x] Implementado

---

### 4.3 Monitoreo y Métricas
- **Descripción**: Health checks y Prometheus
- **Endpoints**: `GET /api/health`, `GET /metrics`

**Pruebas Requeridas**:
- ✅ Integration: Query health → 200
- ✅ Error: Simular failure → unhealthy
- **Estado**: [x] Implementado

---

### 4.4 Seguridad
- **Descripción**: Autenticación y HMAC
- **Requisitos Técnicos**: Middleware de auth

**Pruebas Requeridas**:
- ✅ Unit: Mock token inválido → 401
- ✅ Integration: Request con/sin auth
- ✅ Error: Payload alterado → 401
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

### 4.5 Caching
- **Descripción**: Cache de datos frecuentes
- **Requisitos Técnicos**: Redis/LRU cache

**Pruebas Requeridas**:
- ✅ Unit: Get/set/invalidate cache
- ✅ Integration: Hit/miss scenarios
- ✅ Error: Cache miss fallback
- **Estado**: [x] Implementado (parcial)

---

### 4.6 Notificaciones
- **Descripción**: Alertas por email/Slack
- **Requisitos Técnicos**: Nodemailer/Slack API

**Pruebas Requeridas**:
- ✅ Unit: Mock send alert
- ✅ Integration: Error → notificación
- ✅ Error: Alert fail → log fallback
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

### 4.7 Reporting
- **Descripción**: Generar reports de datos
- **Endpoint**: `GET /api/reports/:type`
- **Requisitos Técnicos**: Queries agregadas

**Pruebas Requeridas**:
- ✅ Unit: Mock report query
- ✅ Integration: Generar report real
- ✅ Error: No data → empty response
- **Estado**: [x] ✅ **COMPLETADO** - [Ver Guía BD Management](GUIA_BD_MANAGEMENT.md)

---

## 📝 Checklist de Implementación

### Base de Datos (PRIORIDAD 1)
- [ ] GET /api/tables/:tableName (lectura)
- [ ] PATCH /api/tables/:tableName/:id (edición)
- [ ] POST /api/tables/:tableName (creación)
- [ ] DELETE /api/tables/:tableName/:id (eliminación)
- [ ] POST /api/admin/schema/alter (modificar esquema)

### Beds24 API (PRIORIDAD 2)
- [x] Sync de reservas
- [ ] PATCH reservas
- [ ] GET disponibilidad
- [ ] Cancelaciones

### Whapi API (PRIORIDAD 3)
- [x] Enviar mensajes
- [x] Indicadores
- [x] Info chats
- [ ] Manejo media

### Extras
- [x] Webhooks
- [x] Colas
- [x] Monitoreo
- [ ] Seguridad
- [x] Caching (parcial)
- [ ] Notificaciones
- [ ] Reporting

---

## 🎯 Próximos Pasos

1. **Empezar por DB Management**: Crear endpoints para CRUD de tablas
2. **Completar Beds24**: Agregar endpoints faltantes
3. **Completar Whapi**: Manejo de media
4. **Seguridad**: Implementar autenticación
5. **Testing**: Agregar tests para cada funcionalidad

**Cobertura Target**: >80% code coverage con tests completos.