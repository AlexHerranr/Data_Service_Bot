# Data Sync Service - Simple & Effective

A clean webhook processor for Beds24 with proper debounce handling.

## Architecture

```
Webhook → Debounce (1 min) → Fetch API → Update DB
```

That's it. No queues, no Redis dependencies, no complex states.

## How It Works

1. **Webhook arrives** → Stored in memory with a 60-second timer
2. **Another webhook for same booking** → Cancel old timer, set new one
3. **After 60 seconds of no changes** → Process once
4. **Fetch latest from Beds24 API** → Upsert to database

## Endpoints

- `POST /api/v1/beds24/v2` - Main webhook endpoint
- `GET /api/v1/beds24/v2/status` - Check pending webhooks
- `GET /status` - Overall service status
- `GET /api/v1/health` - Health check

## Configuration

```bash
# Required
DATABASE_URL=postgresql://...
BEDS24_API_KEY=your-api-key

# Optional
WEBHOOK_DEBOUNCE_MS=60000  # Default: 1 minute
REDIS_URL=redis://...       # Optional, only for token caching
PORT=8080                   # Default: 8080
```

## Development

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Test webhook debounce
npm run test:webhook
```

## Testing Webhooks

Send a test webhook:
```bash
curl -X POST http://localhost:8080/api/v1/beds24/v2 \
  -H "Content-Type: application/json" \
  -d '{
    "booking": {
      "id": "12345",
      "firstName": "Test",
      "status": "confirmed"
    }
  }'
```

Check status:
```bash
curl http://localhost:8080/api/v1/beds24/v2/status
```

## Why This Approach?

- **Simple**: ~200 lines of code vs 1000+ with queues
- **Reliable**: JavaScript setTimeout is rock solid
- **Efficient**: Perfect debounce prevents duplicate processing
- **Maintainable**: Anyone can understand Map + setTimeout

## Deployment

The service handles graceful shutdown:
- On SIGTERM/SIGINT, pending webhooks are processed or cleared
- Beds24 will retry webhooks if not acknowledged
- No data loss on restarts

## Monitoring

Check `/status` endpoint for:
- Pending webhooks count
- Total processed
- Total debounced (savings)
- Memory usage
- Uptime

## Notes

- Webhooks are not persisted across restarts (by design)
- Beds24 retries failed webhooks automatically
- Single instance only (no horizontal scaling needed for < 10k webhooks/day)