# 🚨 Troubleshooting Common Issues

## 📋 **Quick Diagnostic Commands**

**Start here for any issue**:
```bash
npm run monitor           # System status overview
npm run typecheck         # TypeScript validation
npm test                  # Run tests
curl http://localhost:3001/api/health  # Health check
```

---

## 🗄️ **Database Issues**

### **❌ "Cannot connect to database"**

**Symptoms**: App fails to start, health check fails, DB operations timeout

**Diagnosis**:
```bash
# 1. Test direct connection
psql $DATABASE_URL -c "SELECT version();"

# 2. Check environment variable
echo $DATABASE_URL

# 3. Verify format
# Should be: postgresql://user:pass@host:5432/db
```

**Solutions**:
```bash
# Fix DATABASE_URL format
DATABASE_URL="postgresql://username:password@host:5432/database"

# Regenerate Prisma client
npm run db:generate

# Test connection
npm run db:studio
```

**Railway-specific**:
```bash
# Reconnect database service
railway service connect

# Check Railway variables
railway variables

# Restart service
railway up --detach
```

---

### **❌ "Prisma Client validation failed"**

**Symptoms**: `PrismaClientValidationError`, schema mismatches

**Solutions**:
```bash
# 1. Regenerate client
npm run db:generate

# 2. Reset Prisma completely
rm -rf node_modules/.prisma
npm install
npm run db:generate

# 3. Check schema sync
npm run db:studio
```

---

### **❌ "Migration failed" / "Schema out of sync"**

**Solutions**:
```bash
# Apply pending migrations
npm run db:migrate

# Reset development database (DESTRUCTIVE)
npx prisma migrate reset --schema ../prisma/schema.prisma

# Generate fresh migration
npx prisma migrate dev --schema ../prisma/schema.prisma
```

---

## 🔴 **Redis Issues**

### **❌ "Redis connection failed"**

**Symptoms**: Health check fails, queues don't work, no job processing

**Diagnosis**:
```bash
# 1. Test Redis connection
redis-cli ping
# Expected: PONG

# 2. Check REDIS_URL
echo $REDIS_URL

# 3. Test from Node
node -e "const Redis = require('ioredis'); const redis = new Redis(process.env.REDIS_URL); redis.ping().then(console.log).catch(console.error);"
```

**Solutions**:
```bash
# Start local Redis with Docker
docker-compose up redis -d

# Or install Redis locally (Ubuntu/WSL)
sudo apt install redis-server
sudo service redis-server start

# Test connection
redis-cli ping
```

**Railway-specific**:
```bash
# Add Redis service in Railway dashboard
# Copy REDIS_URL to environment variables
```

---

### **❌ "Jobs not processing" / "Queue stuck"**

**Symptoms**: Queue dashboard shows waiting jobs, but nothing processes

**Diagnosis**:
```bash
# Check queue stats
curl http://localhost:3001/api/admin/queues/stats

# Monitor script
npm run monitor

# Check worker errors
npm run dev | grep -i worker
```

**Solutions**:
```bash
# Restart workers
# Kill process and restart
pkill -f "node.*main.js"
npm run dev

# Clear stuck jobs (DESTRUCTIVE)
redis-cli FLUSHDB

# Check Redis memory
redis-cli INFO memory
```

---

## 🏨 **Beds24 API Issues**

### **❌ "Beds24 authentication failed"**

**Symptoms**: 401/403 errors, webhook processing fails, sync fails

**Diagnosis**:
```bash
# Test read token
curl -H "token: $BEDS24_TOKEN" https://api.beds24.com/v2/bookings?limit=1

# Test API connectivity
curl -I https://api.beds24.com/v2/

# Check token in environment
echo $BEDS24_TOKEN | wc -c  # Should be > 10 characters
```

**Solutions**:
```bash
# Update tokens in .env
BEDS24_TOKEN="new_read_token"
BEDS24_WRITE_REFRESH_TOKEN="new_refresh_token"

# Restart service
npm run dev

# Test authentication
curl -H "token: $BEDS24_TOKEN" https://api.beds24.com/v2/authentication/test
```

---

### **❌ "Rate limiting errors" / "Too Many Requests"**

**Symptoms**: 429 HTTP errors, slow sync, API timeouts

**Solutions**:
```bash
# Check rate limiting in code
# The app automatically handles rate limiting, but if issues persist:

# Reduce concurrent requests (in code)
# Or wait and retry
sleep 60 && npm run backfill
```

---

### **❌ "Webhook not receiving data"**

**Symptoms**: No webhook events, outdated data in database

**Diagnosis**:
```bash
# Check webhook endpoint accessibility
curl -X POST http://localhost:3001/api/webhooks/beds24 -H "Content-Type: application/json" -d '{"test": true}'

# Check Beds24 webhook configuration
# Should point to: https://your-domain.com/api/webhooks/beds24

# Monitor incoming webhooks
npm run dev | grep webhook
```

**Solutions**:
```bash
# Verify webhook URL in Beds24 admin panel
# Test with ngrok for local development
ngrok http 3001
# Then use: https://abc123.ngrok.io/api/webhooks/beds24

# Check HMAC signature validation (if enabled)
```

---

## 🖥️ **Server Issues**

### **❌ "Port already in use"**

**Symptoms**: `EADDRINUSE: address already in use :::3001`

**Solutions**:
```bash
# Find and kill process using port 3001
lsof -ti:3001 | xargs kill -9

# Or use different port
PORT=3002 npm run dev

# Or change PORT in .env
PORT=3002
```

---

### **❌ "Module not found" / "Cannot resolve module"**

**Symptoms**: Import errors, TypeScript errors, missing dependencies

**Solutions**:
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Regenerate Prisma client (if Prisma-related)
npm run db:generate

# Check TypeScript configuration
npm run typecheck

# Verify import paths
# Use relative imports: './file' not 'src/file'
```

---

### **❌ "Build fails" / "TypeScript errors"**

**Solutions**:
```bash
# Check TypeScript errors
npm run typecheck

# Fix common issues
# - Missing types: npm install @types/package-name
# - Import errors: Fix import paths
# - Prisma types: npm run db:generate

# Test build
npm run build

# Full validation
npm run test-build
```

---

## 📊 **Performance Issues**

### **❌ "Slow response times" / "High memory usage"**

**Diagnosis**:
```bash
# Monitor system resources
npm run monitor:continuous

# Check Node.js memory usage
node --expose-gc -e "console.log(process.memoryUsage())"

# Profile database queries
npm run db:studio
# Check slow queries in PostgreSQL logs
```

**Solutions**:
```bash
# Restart service to free memory
npm run dev

# Add pagination to large queries
# Optimize database indexes
# Use Redis caching for frequent queries

# Monitor specific routes
curl -w "@curl-format.txt" http://localhost:3001/api/tables/Booking
```

---

### **❌ "Queue processing too slow"**

**Solutions**:
```bash
# Increase concurrency in queue worker
# Add more Redis memory
# Optimize job processing logic
# Monitor with Bull dashboard
```

---

## 🧪 **Testing Issues**

### **❌ "Tests failing"**

**Diagnosis**:
```bash
# Run specific test
npm test -- --grep "health check"

# Run with verbose output
npm test -- --reporter verbose

# Check test database connection
DATABASE_URL="postgresql://test:test@localhost:5432/test_db" npm test
```

**Solutions**:
```bash
# Setup test database
createdb test_bot_data
DATABASE_URL="postgresql://postgres:password@localhost:5432/test_bot_data" npm test

# Fix test environment
cp .env .env.test
# Edit .env.test with test database URL
```

---

## 🚀 **Deployment Issues**

### **❌ "Railway deployment failed"**

**Solutions**:
```bash
# Check build logs in Railway dashboard
# Verify all environment variables are set
# Check package.json scripts

# Test build locally first
npm run build
npm start

# Check Railway-specific issues
railway logs
railway status
```

---

### **❌ "App crashes on startup in production"**

**Diagnosis**:
```bash
# Check Railway logs
railway logs

# Test production environment locally
NODE_ENV=production npm start

# Verify environment variables
railway variables
```

**Common fixes**:
```bash
# Missing DATABASE_URL or REDIS_URL
# Wrong NODE_ENV (should be 'production')
# Missing build step in deploy
# Prisma client not generated
```

---

## 🔧 **Emergency Recovery**

### **🚨 Complete Reset (Nuclear Option)**

**When everything is broken**:
```bash
# 1. Stop all processes
pkill -f node

# 2. Clean everything
rm -rf node_modules package-lock.json
rm -rf .prisma/

# 3. Fresh install
npm install
npm run db:generate

# 4. Reset Redis
redis-cli FLUSHALL

# 5. Test step by step
npm run typecheck
npm test
npm run build
npm run dev
```

### **🆘 Production Emergency**

**If production is down**:
```bash
# 1. Quick health check
curl https://your-domain.com/api/health

# 2. Check Railway status
railway status

# 3. Restart service
railway up --detach

# 4. Monitor logs
railway logs --follow

# 5. Rollback if needed
railway rollback
```

## 📞 **Getting Help**

### **Before Asking for Help**

1. ✅ Run `npm run monitor` and share output
2. ✅ Check logs: `npm run dev` or `railway logs`
3. ✅ Test health endpoint: `curl /api/health`
4. ✅ Verify environment variables are set
5. ✅ Try the solutions above

### **Information to Include**

- **Environment**: Development/Production/Railway
- **Error message**: Full error text
- **Monitor output**: `npm run monitor`
- **Recent changes**: What changed before the issue
- **Reproduction steps**: How to reproduce the problem

---

**Still having issues? Check specific integration guides:**
- [Beds24 Issues](../beds24/) 
- [Database Issues](../database/)
- [Development Setup](DEVELOPMENT_SETUP.md)