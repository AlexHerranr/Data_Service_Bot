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

### 1.1 ✅ **BD Management CRUD Completo** - [Guía Completa](GUIA_BD_MANAGEMENT.md)
- **Descripción**: CRUD completo para 5 tablas con protecciones de seguridad
- **Endpoints**: `GET, POST, PATCH, DELETE /api/tables/:tableName`
- **Tablas**: ClientView (2), Booking (1,191), Leads (19), hotel_apartments (7), IA_CMR_Clientes (0)
- **Funcionalidades**: 
  - ✅ Paginación y filtros dinámicos
  - ✅ Validación de tablas y datos
  - ✅ DELETE bloqueado en producción
  - ✅ Mapeo Prisma correcto
  - ✅ CRM avanzado en Leads

**Resultados de Testing (14 Ago 2025)**:
- ✅ **5/5 tablas** funcionando en producción
- ✅ **Filtros**: `?status=confirmed` (562 de 1,191 reservas)
- ✅ **Seguridad**: DELETE → 403 Forbidden
- ✅ **Performance**: <500ms respuesta
- ✅ **Datos reales**: Reservas Beds24, clientes WhatsApp
- **Estado**: [x] ✅ **100% COMPLETADO**

---

## 2. 🏨 INTEGRACIÓN BEDS24 (PRIORIDAD ALTA)

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