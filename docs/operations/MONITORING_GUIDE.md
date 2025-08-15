# 📊 Monitoring & Observability Guide

## 🎯 **Overview**

Bot Data Service incluye monitoreo completo con métricas, health checks, y alertas automáticas para observabilidad en producción y desarrollo.

## 📈 **Built-in Monitoring Tools**

### **1. 🔍 Monitor Script** 
Script integrado para monitoreo avanzado:

```bash
# Reporte único del estado
npm run monitor

# Monitoreo continuo (updates cada 30s)
npm run monitor:continuous

# Output JSON para integración
npm run monitor:json
```

### **2. 🏥 Health Check Endpoint**
```bash
GET /api/health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00Z",
  "services": {
    "redis": "connected",
    "database": "connected", 
    "beds24": "authenticated"
  },
  "system": {
    "uptime": "2h 15m 30s",
    "memory": "145.2 MB",
    "version": "1.0.0"
  }
}
```

### **3. 📊 Prometheus Metrics**
```bash
GET /metrics
```

**Available at**: http://localhost:3001/metrics

## 📊 **Key Metrics Tracked**

### **HTTP Requests**
- `http_request_duration_ms` - Request duration histogram
- `http_requests_total` - Total HTTP requests by method/status
- `http_request_size_bytes` - Request payload sizes

### **Jobs & Queues**
- `jobs_processed_total` - Total jobs processed
- `jobs_duration_seconds` - Job processing duration
- `jobs_failed_total` - Failed jobs count
- `queue_waiting` - Jobs waiting in queue
- `queue_active` - Currently processing jobs

### **Business Metrics**
- `beds24_webhooks_received_total` - Webhooks received
- `beds24_api_calls_total` - API calls made
- `beds24_bookings_synced_total` - Bookings synchronized
- `database_operations_total` - DB operations by type

### **System Metrics**
- `process_cpu_user_seconds_total` - CPU usage
- `process_resident_memory_bytes` - Memory usage
- `redis_connected_clients` - Redis connections
- `database_connections_active` - Active DB connections

## 🚨 **Monitor Script Features**

### **System Health Overview**
```bash
npm run monitor
```

**Output Example**:
```
🏥 SYSTEM HEALTH - Bot Data Service
====================================

✅ Services Status:
   🗄️  Database: Connected (15ms)
   🔴 Redis: Connected (2ms)
   🏨 Beds24: Authenticated ✓

📊 Queue Stats:
   📥 Beds24 Queue: 0 waiting, 0 active, 247 completed
   ⏱️  Avg Job Duration: 1.2s

💾 System Resources:
   🧠 Memory: 145.2 MB (RSS)
   ⏱️  Uptime: 2h 15m 30s
   🔄 Last Restart: 2h 15m ago

📈 Recent Activity:
   📝 Total Bookings: 1,191
   🔄 Last Sync: 15 minutes ago
   📊 Success Rate: 99.2%
```

### **Continuous Monitoring**
```bash
npm run monitor:continuous
```

Features:
- Updates every 30 seconds
- Color-coded status indicators
- Automatic error detection
- Resource usage tracking
- Queue activity monitoring

### **Alerts & Notifications**
El script detecta automáticamente:
- 🔴 **Critical**: Redis/Database disconnected
- 🟡 **Warning**: High queue backlog (>100 jobs)
- 🟡 **Warning**: High memory usage (>500MB)
- 🟡 **Warning**: Job failure rate >5%
- 🟡 **Warning**: No recent activity (>2 hours)

## 📊 **Bull Dashboard**

### **Web Interface**
```
http://localhost:3001/api/admin/queues/ui
```

**Features**:
- Real-time queue monitoring
- Job details and logs
- Retry failed jobs
- Queue statistics
- Job filtering and search

### **API Stats**
```bash
GET /api/admin/queues/stats
```

**Response**:
```json
{
  "beds24": {
    "waiting": 0,
    "active": 1,
    "completed": 247,
    "failed": 3,
    "delayed": 0
  },
  "whapi": {
    "waiting": 0,
    "active": 0,
    "completed": 0,
    "failed": 0,
    "delayed": 0
  }
}
```

## 🔍 **Custom Monitoring Setup**

### **1. External Monitoring**
Para monitoreo externo (Grafana, DataDog, etc.):

```bash
# Prometheus metrics endpoint
curl http://your-domain.com/metrics

# Health check for uptime monitoring
curl http://your-domain.com/api/health

# JSON status for parsing
npm run monitor:json
```

### **2. Log Monitoring**
```bash
# Follow logs in development
npm run dev | grep ERROR

# Production logs with filtering
npm start 2>&1 | grep -E "(ERROR|WARN|webhook)"

# Monitor specific operations
npm run monitor:continuous | grep -i "beds24"
```

### **3. Database Monitoring**
```bash
# Connect to DB and check stats
npm run db:studio

# Or direct SQL monitoring
psql $DATABASE_URL -c "
  SELECT 
    schemaname,
    tablename,
    n_live_tup as rows,
    n_dead_tup as dead_rows
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;
"
```

## 🚨 **Production Monitoring Best Practices**

### **1. Set Up External Health Checks**
```bash
# Uptime monitoring
curl -f http://your-domain.com/api/health || exit 1

# Check every 5 minutes
*/5 * * * * curl -f http://your-domain.com/api/health
```

### **2. Log Aggregation**
```bash
# Railway logs
railway logs --follow

# Or structured logging
npm run monitor:json | jq '.'
```

### **3. Alerts Configuration**
Recommended alerts:
- **Health check fails** → Immediate notification
- **Queue backlog > 100 jobs** → Warning after 10 minutes
- **Job failure rate > 10%** → Warning
- **Memory usage > 80%** → Warning
- **No activity > 4 hours** → Investigation needed

## 📊 **Performance Monitoring**

### **Response Time Tracking**
```bash
# Monitor API response times
curl -w "@curl-format.txt" http://localhost:3001/api/health
```

**curl-format.txt**:
```
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
```

### **Resource Usage**
```bash
# Memory tracking
npm run monitor | grep Memory

# CPU usage (top/htop)
top -p $(pgrep -f "node.*main.js")
```

## 🔧 **Troubleshooting Monitoring**

### **Monitor Script Not Working**
```bash
# Check dependencies
npm list tsx pino

# Run with debug
DEBUG=* npm run monitor

# Manual execution
npx tsx scripts/monitor.ts
```

### **Metrics Not Updating**
```bash
# Check Prometheus endpoint
curl http://localhost:3001/metrics | head -20

# Verify server is running
ps aux | grep node
```

### **Health Check Failing**
```bash
# Test individual services
redis-cli ping
psql $DATABASE_URL -c "SELECT 1"

# Check logs
npm run dev | grep -i error
```

## 📈 **Integration Examples**

### **Grafana Dashboard**
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'bot-data-service'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: /metrics
    scrape_interval: 30s
```

### **Custom Health Check Script**
```bash
#!/bin/bash
# health-check.sh

HEALTH_URL="http://localhost:3001/api/health"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $STATUS -eq 200 ]; then
    echo "✅ Service healthy"
else
    echo "❌ Service unhealthy (HTTP $STATUS)"
    # Send alert notification here
    exit 1
fi
```

---

**For production deployment monitoring, see [deployment/RAILWAY_DEPLOY_GUIDE.md](../deployment/RAILWAY_DEPLOY_GUIDE.md)**