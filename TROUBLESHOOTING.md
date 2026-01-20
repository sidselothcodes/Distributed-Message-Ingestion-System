# Troubleshooting Guide

## Frontend Shows "Connection Error"

### Run Diagnostic Script First

```bash
cd scripts
./diagnose.sh
```

This will test all connection points and identify the exact issue.

### Most Common Causes (in order of likelihood)

#### 1. Next.js Didn't Pick Up .env.local Changes ⭐ **MOST LIKELY**

**Symptom:** Dashboard shows connection error even though backend is running

**Cause:** Next.js caches environment variables and doesn't reload .env.local automatically

**Solution:**
```bash
cd frontend

# Stop the dev server (Ctrl+C)
# Then restart it
npm run dev

# In browser, hard refresh
# Chrome/Firefox: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
```

**Why this happens:**
- Next.js reads `.env.local` only on startup
- Changes to environment variables require a full restart
- Browser may cache old API calls

---

#### 2. CORS Blocking Requests ⭐ **SECOND MOST LIKELY**

**Symptom:** Browser console shows CORS errors

**Cause:** Next.js dev server uses `127.0.0.1:3000` but backend only allows `localhost:3000`

**Fix Applied:** Added both to CORS allowed origins in `backend/api/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",  # Added this
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Restart backend after fix:**
```bash
cd infrastructure
docker-compose restart api
```

---

#### 3. Backend Not Running

**Symptom:** `curl http://localhost:8000/health` fails

**Check:**
```bash
# Are containers running?
docker ps | grep message

# Should see:
# - ingestor-api
# - message-buffer (Redis)
# - message-db (PostgreSQL)
# - batch-worker
```

**Solution:**
```bash
cd infrastructure
docker-compose up --build
```

---

#### 4. WebSocket Connection Failed

**Symptom:** HTTP endpoints work but no real-time updates

**Check browser console:**
```
WebSocket connection to 'ws://localhost:8000/ws/stats' failed
```

**Possible causes:**
- Backend restarted (WebSocket disconnected)
- Network proxy blocking WebSocket
- Firewall blocking port 8000

**Test WebSocket manually:**
```bash
# Use wscat (install with: npm install -g wscat)
wscat -c ws://localhost:8000/ws/stats

# Should receive JSON every 500ms:
# {"total_messages": 1234, "current_rps": 45.67, ...}
```

**Solution:**
The hook has auto-reconnect built in (every 3 seconds). Just wait or restart frontend.

---

#### 5. Wrong API URL in Frontend

**Check:** `frontend/.env.local`

**Should contain:**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/stats
NEXT_PUBLIC_POLL_INTERVAL=2000
```

**Common mistakes:**
- ❌ `NEXT_PUBLIC_API_URL=http://localhost:3000` (wrong port)
- ❌ `API_URL=http://localhost:8000` (missing NEXT_PUBLIC_ prefix)
- ❌ File not created at all

**Fix:**
```bash
cd frontend

# Create/edit .env.local
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/stats
NEXT_PUBLIC_POLL_INTERVAL=2000
EOF

# IMPORTANT: Restart Next.js
npm run dev
```

---

## Step-by-Step Debugging

### Step 1: Verify Backend Health

```bash
# Test API
curl http://localhost:8000/health

# Expected output:
# {"status":"healthy","redis":"connected","queue_length":0}
```

If this fails:
```bash
# Check logs
docker-compose logs api

# Restart
docker-compose restart api
```

### Step 2: Test CORS

```bash
# Send request with Origin header
curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     http://localhost:8000/health \
     -I

# Look for:
# access-control-allow-origin: http://localhost:3000
```

If missing, backend needs restart after CORS fix.

### Step 3: Check Frontend Environment

```bash
cd frontend

# Verify .env.local exists
cat .env.local

# Should show:
# NEXT_PUBLIC_API_URL=http://localhost:8000
# NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/stats
```

### Step 4: Check Browser Console

Open browser DevTools (F12) and check Console tab:

**Good signs:**
```
WebSocket connected
```

**Bad signs:**
```
Failed to fetch
CORS policy: No 'Access-Control-Allow-Origin' header
WebSocket connection failed
```

### Step 5: Check Network Tab

In DevTools Network tab, look for:
- Request to `http://localhost:8000/health` - should return 200
- WebSocket upgrade to `ws://localhost:8000/ws/stats` - should show "101 Switching Protocols"

---

## Quick Fixes Checklist

### Backend Issues

```bash
cd infrastructure

# Restart API only
docker-compose restart api

# Restart all services
docker-compose restart

# Full rebuild
docker-compose down
docker-compose up --build

# Check logs
docker-compose logs -f api
docker-compose logs -f worker
```

### Frontend Issues

```bash
cd frontend

# Verify .env.local
cat .env.local

# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules
npm install

# Restart dev server
npm run dev
```

### Browser Issues

1. **Hard refresh:** Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Clear cache:** DevTools > Network > Disable cache
3. **Incognito mode:** Test in private browsing
4. **Different browser:** Try Chrome, Firefox, Safari

---

## Docker Networking Issues

### Can't connect from host to container

**Problem:** Frontend can't reach `http://localhost:8000`

**Check port mapping:**
```bash
docker ps | grep ingestor-api

# Should show: 0.0.0.0:8000->8000/tcp
```

**If port not mapped:**
```yaml
# In docker-compose.yml
api:
  ports:
    - "8000:8000"  # Must be present
```

### Containers can't reach each other

**Problem:** API can't connect to Redis

**Check networks:**
```bash
docker network ls
docker network inspect high-speed-ingestor_ingestor-network
```

**Solution:**
All services should be on same network in docker-compose.yml

---

## Redis Issues

### Worker not processing messages

```bash
# Check queue length
docker exec message-buffer redis-cli LLEN pending_messages

# If queue is growing but worker not processing:
docker-compose logs worker
docker-compose restart worker
```

### Metrics not updating

```bash
# Check Redis metrics
docker exec message-buffer redis-cli GET total_messages
docker exec message-buffer redis-cli GET current_rps

# If showing 0 but messages processed:
# Worker might have crashed - restart it
docker-compose restart worker
```

---

## PostgreSQL Issues

### Messages not being saved

```bash
# Connect to database
docker exec -it message-db psql -U ingestor -d messages_db

# Count messages
SELECT COUNT(*) FROM messages;

# Check recent messages
SELECT * FROM messages ORDER BY inserted_at DESC LIMIT 5;
```

If no messages:
- Worker might be stuck
- Database connection failed
- Check worker logs

---

## Common Error Messages

### "Failed to fetch"

**Cause:** Backend not running or wrong URL

**Fix:**
```bash
# Start backend
cd infrastructure
docker-compose up -d

# Verify it's running
curl http://localhost:8000/health
```

### "CORS policy: No 'Access-Control-Allow-Origin' header"

**Cause:** CORS not configured or frontend using different origin

**Fix:**
1. Check `backend/api/main.py` has both `localhost:3000` and `127.0.0.1:3000`
2. Restart backend: `docker-compose restart api`
3. Hard refresh browser

### "WebSocket connection failed"

**Cause:** WebSocket endpoint not reachable

**Fix:**
```bash
# Check if port 8000 is listening
lsof -i :8000

# Restart API
docker-compose restart api

# Frontend will auto-reconnect in 3 seconds
```

### "Redis connection not available"

**Cause:** Redis container not running

**Fix:**
```bash
# Check Redis
docker ps | grep redis

# Start Redis
docker-compose up redis -d

# Restart API and worker
docker-compose restart api worker
```

---

## Nuclear Option (Full Reset)

If nothing else works:

```bash
# Stop everything
cd infrastructure
docker-compose down -v

# Clean frontend
cd ../frontend
rm -rf .next node_modules
npm install

# Rebuild and start backend
cd ../infrastructure
docker-compose up --build

# Start frontend
cd ../frontend
npm run dev

# Hard refresh browser (Cmd+Shift+R)
```

---

## Getting Help

If still stuck:

1. **Run diagnostic:** `./scripts/diagnose.sh`
2. **Check logs:**
   ```bash
   docker-compose logs api | tail -50
   docker-compose logs worker | tail -50
   ```
3. **Browser console:** F12 > Console tab
4. **Network tab:** F12 > Network tab, filter by "health" and "ws"

Include this information when seeking help:
- Diagnostic script output
- Backend logs
- Browser console errors
- Network tab screenshot
