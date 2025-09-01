# Professional Logging System Guide

## Log Event Types

### 1. **WEBHOOK_RECEIVED**
When a webhook arrives from Beds24
```json
{
  "event": "WEBHOOK_RECEIVED",
  "bookingId": "74943974",
  "action": "MODIFY",
  "delayMs": 60000,
  "scheduledFor": "2025-08-29T18:01:00.000Z",
  "messageCount": 0,
  "propertyId": 240061,
  "timestamp": "2025-08-29T18:00:00.000Z"
}
```

### 2. **DB_OPERATION_SUCCESS**
Confirmation that database operation succeeded
```json
{
  "event": "DB_OPERATION_SUCCESS",
  "operation": "UPSERT",
  "action": "INSERT",
  "bookingId": "74943974",
  "dbId": 12345,
  "wasExisting": false,
  "timestamp": "2025-08-29T18:01:05.000Z"
}
```

### 3. **BOOKING_DATA_SAVED**
Complete booking data as saved in database
```json
{
  "event": "BOOKING_DATA_SAVED",
  "bookingId": "74943974",
  "dbId": 12345,
  "guestName": "John Doe",
  "propertyName": "Apartment 715",
  "status": "confirmed",
  "arrivalDate": "2025-09-07",
  "departureDate": "2025-09-13",
  "numNights": 6,
  "totalPersons": 2,
  "totalCharges": "70000",
  "totalPayments": "0",
  "balance": "70000",
  "channel": "direct",
  "lastUpdatedBD": "2025-08-29T18:01:05.000Z",
  "timestamp": "2025-08-29T18:01:05.000Z"
}
```

### 4. **JOB_COMPLETED**
Final confirmation of successful processing
```json
{
  "event": "JOB_COMPLETED",
  "jobId": "beds24-sync-74943974",
  "bookingId": "74943974",
  "syncResult": "created",
  "syncSuccess": true,
  "processingTimeMs": 2150,
  "processingTimeSec": 2.15,
  "timestamp": "2025-08-29T18:01:05.150Z"
}
```

### 5. **DB_OPERATION_FAILED**
When database operation fails
```json
{
  "event": "DB_OPERATION_FAILED",
  "bookingId": "74943974",
  "errorCode": "P2002",
  "errorMessage": "Unique constraint failed on the fields: (`bookingId`)",
  "errorType": "UNIQUE_CONSTRAINT_VIOLATION",
  "timestamp": "2025-08-29T18:01:05.000Z"
}
```

## Search Commands

### Railway CLI

```bash
# Find all successful database operations
railway logs --service=data-sync | grep '"event":"DB_OPERATION_SUCCESS"'

# Find all saved bookings
railway logs --service=data-sync | grep '"event":"BOOKING_DATA_SAVED"'

# Find specific booking
railway logs --service=data-sync | grep '"bookingId":"74943974"'

# Find all completed jobs
railway logs --service=data-sync | grep '"event":"JOB_COMPLETED"'

# Find all errors
railway logs --service=data-sync | grep '"event":"DB_OPERATION_FAILED"'

# Get last 10 saved bookings
railway logs --service=data-sync | grep '"event":"BOOKING_DATA_SAVED"' | tail -10
```

### Using jq for JSON parsing

```bash
# Extract booking IDs from saved bookings
railway logs --service=data-sync | grep '"event":"BOOKING_DATA_SAVED"' | jq -r '.bookingId'

# Get processing times for completed jobs
railway logs --service=data-sync | grep '"event":"JOB_COMPLETED"' | jq '.processingTimeSec'

# Filter bookings by property
railway logs --service=data-sync | grep '"event":"BOOKING_DATA_SAVED"' | jq 'select(.propertyName == "Apartment 715")'
```

## Key Fields for Debugging

### Essential Fields
- `event`: Type of log event
- `bookingId`: Unique booking identifier
- `dbId`: Database record ID (confirms save)
- `timestamp`: When the event occurred
- `action`: INSERT or UPDATE

### Performance Fields
- `processingTimeMs`: Total processing time
- `delayMs`: Configured delay time
- `scheduledFor`: When job will execute

### Error Fields
- `errorCode`: Database error code
- `errorMessage`: Human readable error
- `errorType`: Categorized error type

## Verification Queries

### 1. Confirm Booking Was Saved
```bash
railway logs --service=data-sync | grep '"bookingId":"74943974"' | grep '"event":"DB_OPERATION_SUCCESS"'
```

### 2. Get Full Booking Details
```bash
railway logs --service=data-sync | grep '"bookingId":"74943974"' | grep '"event":"BOOKING_DATA_SAVED"'
```

### 3. Check Processing Time
```bash
railway logs --service=data-sync | grep '"bookingId":"74943974"' | grep '"event":"JOB_COMPLETED"'
```

## Log Flow for Successful Booking

1. `WEBHOOK_RECEIVED` → Webhook arrives
2. Wait 60 seconds
3. `DB_OPERATION_SUCCESS` → Database save confirmed
4. `BOOKING_DATA_SAVED` → Full data logged
5. `JOB_COMPLETED` → Processing finished

## Quick Health Check

```bash
# Count successful saves in last hour
railway logs --service=data-sync --since 1h | grep -c '"event":"DB_OPERATION_SUCCESS"'

# Count failures in last hour
railway logs --service=data-sync --since 1h | grep -c '"event":"DB_OPERATION_FAILED"'

# Average processing time
railway logs --service=data-sync --since 1h | grep '"event":"JOB_COMPLETED"' | jq -s 'add/length | .processingTimeSec'
```

## Important Notes

1. All timestamps are in ISO 8601 format (UTC)
2. All monetary values are strings to preserve precision
3. `dbId` field confirms database save (only exists after successful insert/update)
4. Events are structured for easy parsing with tools like jq, grep, or log aggregators
5. No emojis or decorative elements - pure professional logging