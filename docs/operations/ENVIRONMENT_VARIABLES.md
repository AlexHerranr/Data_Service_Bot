# 🔧 Environment Variables Guide

## 📋 **Complete Environment Reference**

### **🗄️ Database Configuration**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ **Yes** | - | PostgreSQL connection string |

**Format**:
```bash
DATABASE_URL="postgresql://username:password@hostname:5432/database_name"
```

**Examples**:
```bash
# Local development
DATABASE_URL="postgresql://postgres:password@localhost:5432/bot_data"

# Railway (auto-provided)
DATABASE_URL="postgresql://postgres:***@containers-us-west-***.railway.app:5432/railway"

# External provider
DATABASE_URL="postgresql://user:pass@db.example.com:5432/production_db"
```

### **🔴 Redis Configuration**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | ✅ **Yes** | - | Redis connection string |

**Format**:
```bash
REDIS_URL="redis://username:password@hostname:port"
```

**Examples**:
```bash
# Local development
REDIS_URL="redis://localhost:6379"

# Railway Redis (auto-provided)
REDIS_URL="redis://default:***@containers-us-west-***.railway.app:6379"

# External Redis with auth
REDIS_URL="redis://user:password@redis.example.com:6379"

# Redis with SSL
REDIS_URL="rediss://user:password@redis.example.com:6380"
```

### **🏨 Beds24 API Configuration**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BEDS24_TOKEN` | ✅ **Yes** | - | Read-only API token |
| `BEDS24_WRITE_REFRESH_TOKEN` | ✅ **Yes** | - | Write operations refresh token |
| `BEDS24_API_URL` | ⚪ Optional | `https://api.beds24.com/v2` | Beds24 API base URL |

**How to get tokens**:
1. **Read Token**: Generated in Beds24 dashboard → Settings → API
2. **Write Refresh Token**: Special token for write operations (contact admin)

**Example**:
```bash
BEDS24_TOKEN="your_read_only_token_here"
BEDS24_WRITE_REFRESH_TOKEN="your_refresh_token_here" 
BEDS24_API_URL="https://api.beds24.com/v2"
```

### **📱 Whapi Configuration (Future)**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WHAPI_TOKEN` | ⚪ Optional | - | Whapi API token |
| `WHAPI_API_URL` | ⚪ Optional | `https://gate.whapi.cloud` | Whapi API base URL |

### **🖥️ Server Configuration**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | ⚪ Optional | `3001` | Server port |
| `NODE_ENV` | ⚪ Optional | `development` | Environment mode |

**Values for NODE_ENV**:
- `development` - Local development with debug logs
- `production` - Production mode with optimized logging
- `test` - Testing environment

### **📊 Logging Configuration**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | ⚪ Optional | `debug` (dev) / `info` (prod) | Logging verbosity |
| `LOG_PRETTY` | ⚪ Optional | `false` | Pretty print logs |

**LOG_LEVEL Values**:
- `debug` - All logs (development)
- `info` - Info and above
- `warn` - Warnings and errors only
- `error` - Errors only

**Example**:
```bash
# Development
LOG_LEVEL="debug"
LOG_PRETTY="true"

# Production  
LOG_LEVEL="info"
LOG_PRETTY="false"
```

## 📝 **Complete .env Template**

### **Development .env**
```bash
# ======================
# 🗄️ DATABASE
# ======================
DATABASE_URL="postgresql://postgres:password@localhost:5432/bot_data"

# ======================
# 🔴 REDIS
# ======================
REDIS_URL="redis://localhost:6379"

# ======================
# 🏨 BEDS24 API
# ======================
BEDS24_TOKEN="your_read_token_here"
BEDS24_WRITE_REFRESH_TOKEN="your_write_refresh_token_here"
BEDS24_API_URL="https://api.beds24.com/v2"

# ======================
# 📱 WHAPI (Optional)
# ======================
# WHAPI_TOKEN="your_whapi_token"
# WHAPI_API_URL="https://gate.whapi.cloud"

# ======================
# 🖥️ SERVER
# ======================
PORT=3001
NODE_ENV=development

# ======================
# 📊 LOGGING
# ======================
LOG_LEVEL=debug
LOG_PRETTY=true
```

### **Production .env**
```bash
# ======================
# 🗄️ DATABASE
# ======================
DATABASE_URL="postgresql://user:***@prod-db.com:5432/production"

# ======================
# 🔴 REDIS
# ======================
REDIS_URL="redis://***@prod-redis.com:6379"

# ======================
# 🏨 BEDS24 API
# ======================
BEDS24_TOKEN="prod_read_token"
BEDS24_WRITE_REFRESH_TOKEN="prod_write_refresh_token"
BEDS24_API_URL="https://api.beds24.com/v2"

# ======================
# 🖥️ SERVER
# ======================
PORT=3001
NODE_ENV=production

# ======================
# 📊 LOGGING
# ======================
LOG_LEVEL=info
LOG_PRETTY=false
```

## 🔐 **Security Best Practices**

### **DO ✅**
- Store `.env` in root directory (already gitignored)
- Use strong, unique passwords
- Rotate tokens regularly
- Use Railway/platform environment variables for production

### **DON'T ❌**
- Commit `.env` files to git
- Share tokens in chat/email
- Use development tokens in production
- Hardcode secrets in code

## 🚀 **Platform-Specific Setup**

### **Railway**
Railway auto-provides some variables:
```bash
# Auto-provided by Railway
DATABASE_URL="postgresql://..." 
REDIS_URL="redis://..."

# You must add manually
BEDS24_TOKEN="your_token"
BEDS24_WRITE_REFRESH_TOKEN="your_token"
```

### **Local Development**
```bash
# Copy template
cp .env.example .env

# Edit with your values
nano .env

# Start services
docker-compose up -d  # For Redis
npm run dev
```

## 🔍 **Validation & Testing**

### **Test Connection**
```bash
# Test database
npm run db:studio

# Test Redis
redis-cli ping

# Test API tokens
curl -H "token: $BEDS24_TOKEN" https://api.beds24.com/v2/bookings
```

### **Environment Validation**
The app validates environment variables on startup:
```bash
npm run dev
# ✅ Environment validation passed
# 🔄 Connected to PostgreSQL
# 🔴 Connected to Redis
# 🏨 Beds24 API initialized
```

## 🚨 **Troubleshooting**

### **"Environment validation failed"**
- Check all required variables are set
- Verify URL formats
- Test database/Redis connections

### **"Invalid DATABASE_URL format"**
```bash
# Correct format
DATABASE_URL="postgresql://user:pass@host:5432/db"

# Not this
DATABASE_URL="postgres://..." # Wrong protocol
DATABASE_URL="localhost:5432/db" # Missing credentials
```

### **"Redis connection failed"**
- Check Redis is running: `redis-cli ping`
- Verify REDIS_URL format
- Check firewall/network access

---

**For deployment-specific environment setup, see [deployment/RAILWAY_DEPLOY_GUIDE.md](../deployment/RAILWAY_DEPLOY_GUIDE.md)**