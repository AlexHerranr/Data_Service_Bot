# 🚀 Bot Data Service

**Servicio de datos del ecosistema TeAlquilamos WhatsApp Bot** - maneja sincronización multi-fuente con APIs externas (Beds24, Whapi, futuras integraciones), diseñado para escalabilidad y observabilidad avanzada.

## 🎯 **Propósito**

Bot Data Service es el **sistema nervioso de datos** del bot de WhatsApp, encargado de:
- 🔄 **Sincronización bidireccional** con múltiples fuentes de datos
- 📊 **Procesamiento de webhooks** en tiempo real
- 🏨 **Gestión de reservas y leads** centralizados
- 📈 **Observabilidad completa** con métricas y monitoring

## 🏗️ **Arquitectura**

```
┌─────────────────┐    📊 Data    ┌─────────────────┐
│                 │ ◄─────────────► │                 │
│ TeAlquilamos    │                │ Bot Data        │
│ WhatsApp Bot    │                │ Service         │
│                 │ ◄─────────────► │                 │
└─────────────────┘    Webhooks    └─────────────────┘
                                           │
                                           ▼
                                   ┌─────────────────┐
                                   │  External APIs  │
                                   │ • Beds24 ✅     │
                                   │ • Whapi         │
                                   │ • Future APIs   │
                                   └─────────────────┘
```

## 🗄️ **Base de Datos Compartida**

### **Estrategia: BD Unificada**
**MISMA BD COMPARTIDA**:
- Ambos proyectos usan `DATABASE_URL` idéntica
- Schemas Prisma idénticos (ClientView, Booking, Leads, hotel_apartments)
- Bot accede directamente vía database.service.ts

### 📊 **División de Responsabilidades**

#### 🤖 **Bot WhatsApp (Cliente)**
- ✅ **ClientView** - Solo lectura/escritura básica
- ✅ **Conversaciones** - Thread management
- ✅ **WhatsApp API** - Mensajes, indicadores
- ❌ **NO debe tocar Beds24/Reservas directamente**

#### 🏨 **Bot Data Service (Backend)**
- ✅ **CRUD completo** - Todas las tablas
- ✅ **Beds24 API** - Sincronización reservas
- ✅ **Webhooks** - Procesamiento async
- ✅ **Whapi Admin** - Gestión avanzada

#### 🎯 **Comunicación**
```
Bot WhatsApp → BD ← Bot Data Service
     ↓              ↑
ClientView     Reservas/Beds24
```

### 🗂️ **Tablas Gestionadas**

| Tabla | Bot WhatsApp | Data Service | Descripción |
|-------|--------------|--------------|-------------|
| **ClientView** | ✅ R/W | ✅ CRUD | Clientes WhatsApp |
| **Booking** | ❌ Solo lectura | ✅ CRUD | Reservas Beds24 |
| **Leads** | ❌ Solo lectura | ✅ CRUD | Prospectos |
| **hotel_apartments** | ❌ Solo lectura | ✅ CRUD | Propiedades |

**RESULTADO**: Bot mantiene función actual (chat + BD básica), Data Service maneja lógica de negocio

## 📚 **Documentación Detallada**

### Integraciones
- 🏨 **[Guía Beds24 Webhooks](docs/GUIA_BEDS24_WEBHOOKS.md)** - **Documentación completa**
  - Qué envía Beds24, configuración, implementación técnica, troubleshooting
- 📋 **[Checklist Funcionalidades](docs/BOT_DATA_SERVICE_FUNCIONALIDADES.md)** - Lista completa
- 📚 **[Índice Documentación](docs/INDICE_DOCUMENTACION.md)** - Todas las guías

### Sistema
- 🗄️ **[BD Management CRUD](docs/GUIA_BD_MANAGEMENT.md)** - ✅ **Endpoints CRUD completos**
- 🏨 **[Guía Tabla Hoteles](docs/GUIA_TABLA_HOTELES.md)** - Mapeo de propiedades
- 📊 **[BD Status Automático](docs/RESUMEN_BDSTATUS_AUTOMATICO.md)** - Sistema de estados
- 🗄️ **[Estrategia BD Compartida](ESTRATEGIA_BD_COMPARTIDA.md)** - Arquitectura DB

### **Componentes**
- **`data-sync/`** - Servicio principal BullMQ + Prometheus + OpenAPI
- **`migration-scripts/`** - Scripts de migración y optimización de BD
- **`docs/`** - Documentación técnica
- **`prisma/`** - Esquema de base de datos

## ⚡ **Características**

- **🔄 Multi-Source Integration**: Beds24, Whapi, y futuras APIs
- **📊 Prometheus Metrics**: 15+ métricas de performance y negocio
- **📚 OpenAPI Documentation**: Documentación interactiva Swagger
- **🏥 Health Monitoring**: Redis, DB, y queue status
- **🔍 Advanced Monitoring**: Script con alertas automáticas
- **🐳 Docker Ready**: Redis local para desarrollo

## 🚀 **Inicio Rápido**

### **1. Configuración**
```bash
cd data-sync
cp ../.env.example .env
# Editar .env con tus valores
```

### **2. Instalación**
```bash
npm install
npm run db:generate
```

### **3. Desarrollo**
```bash
# Terminal 1: Redis local
docker-compose up -d

# Terminal 2: Servidor
npm run dev

# Terminal 3: Monitoring
npm run monitor:continuous
```

### **4. Acceso**
- **API**: http://localhost:3001
- **Swagger**: http://localhost:3001/api-docs
- **Bull Dashboard**: http://localhost:3001/api/admin/queues/ui
- **Métricas**: http://localhost:3001/metrics

## 📊 **Scripts Disponibles**

### **Desarrollo**
```bash
npm run dev          # Servidor con hot reload
npm run build        # Compilar TypeScript
npm run test         # Ejecutar tests
```

### **Base de Datos**
```bash
npm run db:generate  # Generar cliente Prisma
npm run db:migrate   # Aplicar migraciones
npm run db:studio    # Interfaz visual DB
```

### **Sincronización**
```bash
npm run backfill     # Sincronización completa
npm run sync:cancelled # Solo reservas canceladas
npm run sync:leads   # Solo leads pendientes
```

### **Monitoring**
```bash
npm run monitor                 # Reporte único
npm run monitor:continuous      # Monitoreo continuo
npm run monitor:json           # Output JSON
```

## 📈 **Endpoints API**

### **Core**
- `GET /api/health` - Health check completo
- `GET /metrics` - Métricas Prometheus
- `GET /api-docs` - Documentación Swagger

### **Admin**
- `GET /api/admin/queues/ui` - Bull Dashboard
- `GET /api/admin/queues/stats` - Estadísticas queues

### **Webhooks**
- `POST /api/webhooks/beds24` - Webhook Beds24
- `POST /api/webhooks/whapi` - Webhook Whapi (futuro)

## 🔄 **Fuentes de Datos**

### **Actuales**
- **Beds24**: Reservas, disponibilidad, propiedades
- **Whapi**: Mensajes, clientes, contexto conversacional
- **Bot Database**: Estados, threads, cache

### **Futuras**
- **Airbnb**: Listings y reservas
- **Booking.com**: Channel management
- **Stripe**: Pagos y billing
- **Google Calendar**: Sincronización disponibilidad

## 🧪 **Testing**

```bash
npm test              # Tests unitarios
npm run test:coverage # Coverage report
```

Tests incluyen:
- ✅ Health checks
- ✅ Configuration validation
- ✅ Sync logic validation
- ✅ Webhook processing

## 📋 **Scripts de Migración**

En `migration-scripts/`:
- `improve-leads-structure.ts` - Mejora estructura Leads
- `optimize-leads-table.ts` - Optimización performance
- `setup-leads-sync-trigger.ts` - Triggers automáticos

```bash
npx tsx migration-scripts/script-name.ts
```

## ⚠️ **Configuración de BD Compartida**

**IMPORTANTE**: Lee `ESTRATEGIA_BD_COMPARTIDA.md` para entender la arquitectura.

**Estrategia actual**:
- 🟡 **Database compartida** con bot principal (intencional)
- 🟡 **APIs compartidas** (Beds24, Whapi)
- 🟡 **Redis compartido** con prefijos diferentes

Esta estrategia permite **zero downtime** y **desarrollo ágil**.

## 🐳 **Docker**

Redis local incluido:
```bash
docker-compose up -d    # Iniciar Redis
docker-compose down     # Detener Redis
```

## 📊 **Métricas Disponibles**

- **Jobs**: Procesados, duración, errores
- **HTTP**: Request duration, status codes
- **Business**: Webhooks, sincronizaciones, API calls
- **System**: Redis health, DB connections, uptime

## 🔍 **Troubleshooting**

### **Error de conexión DB**
```bash
# Verificar variables de entorno
npm run monitor

# Regenerar cliente Prisma
npm run db:generate
```

### **Redis no disponible**
```bash
# Iniciar Redis local
docker-compose up redis -d

# O verificar REDIS_URL en .env
```

### **Build failures**
```bash
# Limpiar y reinstalar
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 🤝 **Contribución**

1. Fork el repositorio
2. Crear feature branch
3. Ejecutar tests: `npm test`
4. Build sin errores: `npm run build`
5. Crear Pull Request

## 📄 **Licencia**

MIT License - Ver archivo LICENSE para detalles.

---

**🔗 Parte integral del ecosistema TeAlquilamos WhatsApp Bot**