# 📋 Documentación ClientView - Estado Actual

## 📊 Resumen Ejecutivo

**ClientView** es una tabla que almacena contactos de WhatsApp sincronizados desde la API de Whapi. Actualmente contiene **243 contactos** con mensajes intercambiados.

---

## 🏗️ Estructura Actual de la Tabla

```prisma
model ClientView {
  phoneNumber        String    @id
  name               String?   // Nombre del contacto
  userName           String?   // Nombre alternativo
  labels             String?   // Etiquetas de WhatsApp (separadas por comas)
  chatId             String?   @unique // ID único del chat en WhatsApp
  lastActivity       DateTime  @updatedAt // Última actividad/mensaje
  threadId           String?   // ID del thread de conversación para IA
  threadTokenCount   Int?      @default(0) // Contador de tokens para límites de IA
}
```

---

## 📝 Historial de Cambios Realizados

### 1. **Optimización Inicial**
- **Fecha**: 30/08/2025
- **Acción**: Simplificación de ClientView
- **Cambios**:
  - ✅ Eliminados campos redundantes de CRM/IA
  - ✅ Mantenidos solo campos esenciales de WhatsApp
  - ✅ Reducción de columnas de ~15 a 8

### 2. **Job de Limpieza de Threads**
- **Fecha**: 30/08/2025
- **Acción**: Creación de cron job para limpieza automática
- **Ubicación**: `/workspace/jobs/cleanup-threads-simple.js`
- **Función**: Resetea `threadId` y `threadTokenCount` cuando supera 1 millón de tokens
- **Estado**: ✅ Implementado y configurado

### 3. **Sincronización con WhatsApp**
- **Fecha**: 30/08/2025
- **Intentos realizados**:

#### Intento 1: Sincronización básica
- **Script**: `sync-whatsapp-contacts.js`
- **Problema**: Incluía TODOS los contactos, incluso sin mensajes
- **Resultado**: 1,655 contactos (muchos vacíos)

#### Intento 2: Filtro por last_message
- **Script**: `sync-only-with-messages.js`
- **Mejora**: Solo contactos con `last_message`
- **Resultado**: 243 contactos con mensajes reales

#### Intento 3: Filtro por actividad reciente
- **Script**: `sync-recent-active-chats.js`
- **Estrategia**: Usar `/messages/list` con filtro temporal
- **Problema**: No captura nombres ni etiquetas
- **Resultado**: 34 contactos (solo últimos 30 días)

#### Intento 4: Sincronización definitiva ✅
- **Script**: `sync-whatsapp-final.js` y `sync-all-chats-complete.js`
- **Estrategia**: `/chats` con filtro por `last_message`
- **Resultado**: 243 contactos con toda la información

---

## 📊 Estado Actual de los Datos

### Estadísticas Generales
| Métrica | Valor | Descripción |
|---------|-------|-------------|
| **Total en WhatsApp** | 1,655 | Todos los contactos guardados |
| **Con mensajes** | 243 | Conversaciones reales |
| **Sin mensajes** | 1,411 | Solo contactos guardados |
| **Grupos** | 2 | Grupos activos |
| **Con etiquetas** | 18 | Contactos etiquetados |
| **Con nombres** | 185 | 76% identificados |

### Distribución Temporal
- **Última semana**: 7 contactos
- **Último mes**: 12 contactos
- **Últimos 3 meses**: 65 contactos
- **Total histórico**: 243 contactos

### Etiquetas Capturadas
- Confirmada 🥰
- EQUIPO/COLEGAS🧐
- Cotizando😋

---

## 🔍 Análisis de los Endpoints de Whapi

### `/chats` - Endpoint de Chats
**Ventajas:**
- ✅ Incluye nombres completos
- ✅ Incluye etiquetas (labels)
- ✅ Incluye `last_message` para filtrar
- ✅ Información completa del chat

**Desventajas:**
- ❌ Límite de 500 por request
- ❌ No todos los chats tienen `last_message`
- ❌ Incluye muchos contactos sin conversación

**Datos obtenidos:**
```javascript
{
  "id": "573123456789@s.whatsapp.net",
  "name": "Juan Pérez",
  "type": "contact",
  "timestamp": 1756501053,
  "labels": [
    {"id": "9", "name": "Cliente VIP", "color": "gold"}
  ],
  "last_message": {
    "id": "msg123",
    "timestamp": 1756501053,
    "text": {"body": "Hola, necesito información"}
  }
}
```

### `/messages/list` - Endpoint de Mensajes
**Ventajas:**
- ✅ Filtros temporales precisos
- ✅ Solo contactos con mensajes reales
- ✅ Información detallada de cada mensaje

**Desventajas:**
- ❌ NO incluye nombres de contactos
- ❌ NO incluye etiquetas
- ❌ Requiere procesamiento adicional para extraer chats únicos

**Datos obtenidos:**
```javascript
{
  "chat_id": "573123456789@s.whatsapp.net",
  "chat_name": null, // A veces vacío
  "from": "573123456789",
  "from_name": null, // A veces vacío
  "timestamp": 1756501053,
  "text": {"body": "Mensaje"}
}
```

---

## ⚠️ Problemas Identificados

### 1. **Discrepancia en cantidad de chats**
- Usuario reporta tener "más de 1,000 chats"
- API solo devuelve 243 con `last_message`
- Posibles causas:
  - Chats archivados sin `last_message`
  - Limitación de la API de Whapi
  - Chats con mensajes eliminados

### 2. **Información incompleta**
- `/chats`: Tiene nombres y etiquetas pero muchos sin mensajes
- `/messages/list`: Solo mensajes pero sin metadata del contacto
- No hay endpoint perfecto que combine ambos

### 3. **Inconsistencia en los datos**
- Algunos chats tienen `name` vacío
- Algunos mensajes no tienen `chat_name`
- Las etiquetas solo vienen en `/chats`

---

## 🎯 Solución Propuesta: Combinación de Endpoints

### Estrategia Híbrida
1. **Usar `/messages/list`** para identificar chats activos
2. **Usar `/chats`** para obtener metadata (nombres, etiquetas)
3. **Combinar ambas fuentes** para datos completos

### Implementación Sugerida
```javascript
// Paso 1: Obtener todos los chats con mensajes recientes
const messages = await fetchWhapi('/messages/list?time_from=X&count=1000');
const uniqueChats = extractUniqueChats(messages);

// Paso 2: Obtener metadata de todos los chats
const allChats = await fetchWhapi('/chats?count=500&offset=0');
const chatMetadata = createMetadataMap(allChats);

// Paso 3: Combinar información
const completeChats = uniqueChats.map(chat => ({
  ...chat,
  name: chatMetadata[chat.id]?.name,
  labels: chatMetadata[chat.id]?.labels
}));
```

---

## 📌 Tareas Pendientes

### Alta Prioridad
1. **[ ] Implementar sincronización híbrida**
   - Combinar `/messages/list` + `/chats`
   - Script: `sync-hybrid-complete.js`

2. **[ ] Investigar chats faltantes**
   - Verificar si hay más de 243 chats con mensajes
   - Probar con diferentes filtros temporales
   - Contactar soporte Whapi si es necesario

3. **[ ] Automatizar sincronización**
   - Crear cron job diario/semanal
   - Actualización incremental (no borrar todo)

### Media Prioridad
4. **[ ] Mejorar captura de nombres**
   - Algunos contactos sin nombre
   - Buscar en mensajes anteriores
   - Cruzar con base de datos de Booking

5. **[ ] Gestión de etiquetas**
   - Sincronizar cambios de etiquetas
   - Crear sistema de categorización automática

### Baja Prioridad
6. **[ ] Métricas y reportes**
   - Dashboard de actividad de WhatsApp
   - Análisis de engagement
   - Identificación de contactos inactivos

---

## 🔧 Scripts Disponibles

| Script | Función | Estado |
|--------|---------|--------|
| `sync-whatsapp-final.js` | Sincronización con filtro last_message | ✅ Funcional |
| `sync-all-chats-complete.js` | Obtiene todos con paginación completa | ✅ Funcional |
| `sync-recent-active-chats.js` | Solo últimos 30 días | ⚠️ Sin metadata |
| `cleanup-threads-simple.js` | Limpieza de tokens IA | ✅ Funcional |
| `sync-hybrid-complete.js` | Combinación de endpoints | ❌ Pendiente |

---

## 📈 Métricas de Rendimiento

- **Tiempo de sincronización**: ~45 segundos para 1,655 chats
- **Tasa de éxito**: 100% (243/243 insertados)
- **Uso de API**: ~20 requests (batches de 100-500)
- **Espacio en BD**: ~50KB (243 registros)

---

## 🚀 Próximos Pasos Recomendados

1. **Implementar sincronización híbrida** para capturar TODOS los chats con mensajes
2. **Crear job de sincronización incremental** (no borrar todo cada vez)
3. **Investigar discrepancia** entre 243 y "más de 1,000" chats reportados
4. **Documentar proceso de etiquetado** y su uso en el CRM
5. **Integrar con IA_CRM_Clientes** para unificar datos

---

## 📞 Contacto y Soporte

- **API Whapi**: [Documentación](https://whapi.readme.io/)
- **Límites de API**: 500 chats por request, sin límite de requests
- **Tokens disponibles**: Verificar en dashboard de Whapi

---

*Última actualización: 30/08/2025 - 22:00*