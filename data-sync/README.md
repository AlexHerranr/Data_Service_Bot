# 🏨 Bot Data Service - Sincronización Beds24

Sistema de sincronización de reservas entre Beds24 y base de datos PostgreSQL.

## 🚀 Quick Start

### Sincronización de Reservas
```bash
# Opción recomendada - Maneja rate limits automáticamente
npm run sync:smart
```

## 📋 Scripts Disponibles

| Script | Comando | Descripción |
|--------|---------|-------------|
| **sync:smart** | `npm run sync:smart` | ✅ RECOMENDADO - Maneja rate limits automáticamente |
| sync:complete | `npm run sync:complete` | Sincronización completa básica |
| sync:optimized | `npm run sync:optimized` | Versión optimizada (una sola llamada API) |
| sync:modified | `npm run sync:modified` | Solo reservas modificadas (últimas 24h) |
| start | `npm start` | Inicia el servicio de webhooks |
| dev | `npm run dev` | Modo desarrollo con hot-reload |
| build | `npm run build` | Compila TypeScript a JavaScript |

## 🏗️ Arquitectura

```
data-sync/
├── src/
│   ├── server/          # API y webhooks
│   ├── providers/       # Integraciones (Beds24)
│   ├── infra/          # Infraestructura (DB, Queue)
│   ├── scripts/        # Scripts de sincronización
│   └── utils/          # Utilidades y helpers
├── prisma/
│   └── schema.prisma   # Esquema de base de datos
└── logs/               # Archivos de log
```

## 🔧 Configuración

### Variables de Entorno (.env)
```env
# Base de datos PostgreSQL (Railway)
DATABASE_URL=postgresql://...

# Redis para colas (Railway)
REDIS_URL=redis://...

# Beds24 API
BEDS24_API_KEY=tu_api_key
BEDS24_PROP_KEY=tu_prop_key
BEDS24_WEBHOOK_TOKEN=tu_webhook_token

# Servidor
PORT=8080
NODE_ENV=production
```

## 📊 Base de Datos

### Tabla Principal: Booking
- **bookingId**: ID único de Beds24
- **guestName**: Nombre del huésped
- **status**: Estado de la reserva
- **arrivalDate**: Fecha de llegada
- **departureDate**: Fecha de salida
- **propertyName**: Propiedad reservada
- **messages**: Mensajes de la reserva (JSON)
- **raw**: Datos completos de Beds24 (JSON)

### Triggers Automáticos
- Sincronización con tabla Leads para reservas pendientes
- Actualización automática de BDStatus

## 🔄 Webhooks

El servicio escucha webhooks de Beds24 en:
```
POST /webhooks/beds24
```

### Procesamiento Inteligente:
- **CREATED**: Procesamiento inmediato
- **MODIFY con mensajes**: Procesamiento inmediato
- **MODIFY sin mensajes**: Delay de 3 minutos
- **CANCEL**: Procesamiento inmediato

## ⚠️ Rate Limits

Beds24 permite máximo **600 requests cada 5 minutos**.

El script `sync:smart` maneja esto automáticamente:
- Detecta error 429
- Espera 6 minutos
- Reintenta automáticamente
- Muestra progreso visual

## 📝 Logs

Los logs se guardan en:
- `logs/app.log` - Log general
- `logs/error.log` - Solo errores
- `logs/sync.log` - Sincronizaciones

Ver logs en tiempo real:
```bash
tail -f logs/app.log
```

## 🐛 Troubleshooting

### Error: "Null constraint violation on the fields: (`leadType`)"
✅ **RESUELTO** - Campo obsoleto eliminado en v2.0.0

### Error: "Credit limit exceeded"
Use `npm run sync:smart` que maneja rate limits automáticamente

### Error: "Connection timeout"
Verifique:
1. Variables de entorno en `.env`
2. Servicio activo en Railway
3. Conexión a internet

## 📚 Documentación Adicional

- [Guía de Sincronización](/workspace/GUIA_SINCRONIZACION_RESERVAS.md)
- [Estrategia de Sincronización](/workspace/ESTRATEGIA_SINCRONIZACION_BD.md)
- [Changelog](/workspace/CHANGELOG_SINCRONIZACION.md)

## 🔒 Seguridad

- Webhooks validados con token
- Conexiones SSL/TLS a bases de datos
- Variables sensibles en `.env` (no en código)
- Logs sin información sensible

## 📈 Métricas

Verificar estado actual:
```bash
# Total de reservas
npm run check:count

# Reservas por estado
npm run check:status
```

## 🤝 Contribuir

1. Crear rama desde `main`
2. Hacer cambios
3. Actualizar documentación
4. Crear PR con descripción clara

---

**Versión**: 2.0.0  
**Última actualización**: Diciembre 2024  
**Mantenedor**: Team Pa'Cartagena