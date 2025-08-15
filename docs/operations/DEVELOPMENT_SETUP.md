# 🛠️ Development Setup Guide

## 📋 **Prerequisites**

### **Required Software**
- **Node.js** >= 18.x
- **PostgreSQL** >= 13.x 
- **Redis** >= 6.x (or Docker)
- **Git**

### **Optional Tools**
- **Docker** (for Redis local)
- **VSCode** with extensions:
  - Prisma
  - TypeScript
  - Thunder Client (API testing)

## 🚀 **Quick Setup**

### **1. Clone & Environment**
```bash
git clone <repo-url>
cd bot-data-service/data-sync
cp ../.env.example .env
```

### **2. Environment Variables**
Edit `.env` with your values:
```bash
# Database
DATABASE_URL="postgresql://user:pass@host:5432/db_name"

# Redis
REDIS_URL="redis://localhost:6379"

# Beds24 (get from admin)
BEDS24_TOKEN="your_read_token"
BEDS24_WRITE_REFRESH_TOKEN="your_write_refresh_token"
BEDS24_API_URL="https://api.beds24.com/v2"

# Server
PORT=3001
NODE_ENV=development
LOG_LEVEL=debug
```

### **3. Install Dependencies**
```bash
npm install
npm run db:generate
```

### **4. Start Development**
```bash
# Terminal 1: Redis (if using Docker)
docker-compose up -d

# Terminal 2: Development server
npm run dev

# Terminal 3: Monitor (optional)
npm run monitor:continuous
```

## 🔍 **Verify Installation**

### **Check Services**
- **API**: http://localhost:3001
- **Health**: http://localhost:3001/api/health
- **Swagger**: http://localhost:3001/api-docs
- **Bull Dashboard**: http://localhost:3001/api/admin/queues/ui
- **Metrics**: http://localhost:3001/metrics

### **Test Database Connection**
```bash
npm run db:studio  # Opens Prisma Studio
```

### **Test API Endpoints**
```bash
# Health check
curl http://localhost:3001/api/health

# List tables
curl http://localhost:3001/api/tables/Booking?limit=5
```

## 🧪 **Run Tests**
```bash
npm test              # Unit tests
npm run test:coverage # With coverage
npm run typecheck     # Type validation
npm run test-build    # Full validation
```

## 🐳 **Docker Setup (Alternative)**

If you prefer Docker for everything:
```bash
# Start all services
docker-compose up -d

# Run development server
npm run dev
```

## 🔧 **Common Development Tasks**

### **Database Operations**
```bash
npm run db:generate   # Regenerate Prisma client
npm run db:migrate    # Apply migrations
npm run db:studio     # Visual database interface
```

### **Sync Operations**
```bash
npm run backfill      # Full sync from Beds24
npm run sync:leads    # Sync leads only
npm run monitor       # Check system status
```

### **Build & Deploy**
```bash
npm run build         # Build for production
npm run start         # Start production build
```

## 🚨 **Troubleshooting**

### **Common Issues**

#### **"Cannot connect to database"**
```bash
# Check DATABASE_URL format
echo $DATABASE_URL

# Test direct connection
psql $DATABASE_URL -c "SELECT version();"

# Regenerate Prisma client
npm run db:generate
```

#### **"Redis connection failed"**
```bash
# Check Redis status
redis-cli ping

# Or start Docker Redis
docker-compose up redis -d
```

#### **"Module not found" errors**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run db:generate
```

#### **TypeScript errors**
```bash
# Check types
npm run typecheck

# Build test
npm run build
```

## 📁 **Project Structure**
```
data-sync/
├── src/
│   ├── config/          # Environment configuration
│   ├── infra/           # Database, Redis, Queues
│   ├── integrations/    # External APIs (Beds24, etc)
│   ├── providers/       # Business logic
│   ├── server/routes/   # HTTP endpoints
│   └── utils/           # Utilities
├── tests/               # Test files
├── scripts/             # Utility scripts
└── docs/                # Documentation
```

## 🔄 **Development Workflow**

### **1. Feature Development**
```bash
git checkout -b feature/your-feature
# Make changes
npm test
npm run build
git commit -m "feat: your feature"
```

### **2. Before Push**
```bash
npm run typecheck    # No TypeScript errors
npm test             # All tests pass
npm run build        # Build succeeds
```

### **3. Testing API Changes**
- Use Swagger UI at http://localhost:3001/api-docs
- Or Thunder Client extension in VSCode
- Check logs with `npm run monitor`

## 📊 **Monitoring During Development**

### **Logs**
```bash
# Continuous monitoring
npm run monitor:continuous

# JSON output for parsing
npm run monitor:json

# Single status check
npm run monitor
```

### **Metrics**
- Prometheus: http://localhost:3001/metrics
- Health check: http://localhost:3001/api/health
- Queue stats: http://localhost:3001/api/admin/queues/stats

## 💡 **Tips**

1. **Use `npm run dev`** for hot reload during development
2. **Check logs** frequently with monitor commands
3. **Test endpoints** with Swagger UI before writing code
4. **Run typecheck** before commits to catch issues early
5. **Use Docker** for Redis to avoid local installation

---

**For production setup, see [deployment/RAILWAY_DEPLOY_GUIDE.md](../deployment/RAILWAY_DEPLOY_GUIDE.md)**