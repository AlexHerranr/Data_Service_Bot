# 📚 Documentación Bot Data Service

## 🏨 Integración Beds24

### 📋 Documentos Principales
- **[BEDS24_WEBHOOK_INTEGRATION.md](BEDS24_WEBHOOK_INTEGRATION.md)** - Guía completa de integración
  - Configuración en Beds24
  - Arquitectura del sistema
  - Flujo de sincronización
  - Monitoreo y debugging

- **[BEDS24_WEBHOOK_TECHNICAL_SPEC.md](BEDS24_WEBHOOK_TECHNICAL_SPEC.md)** - Especificación técnica
  - Implementación detallada del código
  - Tipos de datos y interfaces
  - Configuración de colas
  - Testing y deployment

- **[BEDS24_WEBHOOK_TROUBLESHOOTING.md](BEDS24_WEBHOOK_TROUBLESHOOTING.md)** - Resolución de problemas
  - Problemas comunes y soluciones
  - Herramientas de debugging
  - Monitoreo proactivo
  - Procedimientos de escalación

### 🎯 Estado Actual
- ✅ **Webhook configurado y operativo**
- ✅ **Sistema de colas funcionando**
- ✅ **Error handling robusto**
- ✅ **Logging y métricas implementadas**
- 🔄 **En proceso**: HMAC verification y testing comprehensivo

## 🏗️ Sistema General

### 📊 Base de Datos
- **[GUIA_TABLA_HOTELES.md](GUIA_TABLA_HOTELES.md)** - Mapeo de propiedades y configuración
- **[RESUMEN_BDSTATUS_AUTOMATICO.md](RESUMEN_BDSTATUS_AUTOMATICO.md)** - Sistema de estados automático

### 🚀 Deployment
- **[../RAILWAY_DEPLOY_GUIDE.md](../RAILWAY_DEPLOY_GUIDE.md)** - Guía completa de deployment en Railway
- **[../CONFLICTOS_Y_CONSIDERACIONES.md](../CONFLICTOS_Y_CONSIDERACIONES.md)** - Resolución de conflictos
- **[../ESTRATEGIA_BD_COMPARTIDA.md](../ESTRATEGIA_BD_COMPARTIDA.md)** - Estrategia de base de datos compartida

## 🔗 Enlaces Rápidos

### 🌐 Endpoints de Producción
- **Health**: https://dataservicebot-production.up.railway.app/api/health
- **Queue Stats**: https://dataservicebot-production.up.railway.app/api/admin/queues/stats
- **Webhook Beds24**: https://dataservicebot-production.up.railway.app/api/webhooks/beds24
- **Metrics**: https://dataservicebot-production.up.railway.app/metrics

### 🔧 Herramientas de Debug
```bash
# Test de conectividad
curl https://dataservicebot-production.up.railway.app/api/health

# Estado de colas
curl https://dataservicebot-production.up.railway.app/api/admin/queues/stats

# Test webhook Beds24
curl -X POST https://dataservicebot-production.up.railway.app/api/webhooks/beds24 \
  -H "Content-Type: application/json" \
  -d '{"booking": {"id": 123, "status": "test"}}'
```

### 📊 Monitoreo
- **Railway Logs**: Railway Dashboard → Data_Service_Bot → Logs
- **Métricas**: `/metrics` endpoint con Prometheus format
- **Queue Dashboard**: `/api/admin/queues` (en desarrollo)

## 🎯 Próximos Pasos

### 🔐 Seguridad
- [ ] Implementar verificación HMAC para webhooks
- [ ] Rate limiting por IP
- [ ] Logging de intentos de acceso no autorizados

### 🧪 Testing
- [ ] Unit tests comprehensivos
- [ ] Integration tests end-to-end
- [ ] Load testing para webhooks

### 📈 Performance
- [ ] Optimización de queries de BD
- [ ] Caching de datos frecuentes
- [ ] Monitoring avanzado con alertas

### 🔄 Integraciones Futuras
- [ ] WhAPI webhook implementation
- [ ] APIs adicionales según requerimientos
- [ ] Dashboard de administración web

---

## 📞 Soporte

### 🆘 Para Problemas Urgentes
1. Revisar [Troubleshooting Guide](BEDS24_WEBHOOK_TROUBLESHOOTING.md)
2. Verificar health endpoints
3. Revisar Railway logs
4. Contactar equipo de desarrollo

### 📝 Para Mejoras o Features
1. Documentar requerimiento
2. Evaluar impacto en sistema actual
3. Planificar implementación
4. Testing y deployment controlado

### 🔍 Para Debugging Técnico
1. Usar herramientas de debug documentadas
2. Revisar logs estructurados
3. Analizar métricas de performance
4. Escalar según procedimientos establecidos