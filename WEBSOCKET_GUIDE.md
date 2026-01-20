# WebSocket Real-Time Integration Guide

This guide explains the WebSocket implementation for real-time data streaming from the backend to the dashboard.

## Architecture Overview

```
┌─────────────┐     WebSocket      ┌──────────────┐
│  Dashboard  │◄──── 500ms ────────│   FastAPI    │
│ (Frontend)  │    (Real-time)     │   Backend    │
└─────────────┘                    └──────────────┘
                                           │
                                           │ Read Metrics
                                           ▼
                                    ┌──────────────┐
                                    │    Redis     │
                                    │   Metrics    │
                                    └──────────────┘
                                           ▲
                                           │ Update
                                           │
                                    ┌──────────────┐
                                    │    Worker    │
                                    │  Processor   │
                                    └──────────────┘
```

## Implementation Details

### 1. Backend API ([backend/api/main.py](backend/api/main.py))

**CORS Middleware**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**WebSocket Endpoint: `/ws/stats`**
```python
@app.websocket("/ws/stats")
async def websocket_stats(websocket: WebSocket):
    await websocket.accept()

    while True:
        # Read from Redis
        total_messages = redis_client.get("total_messages")
        current_rps = redis_client.get("current_rps")
        total_batches = redis_client.get("total_batches")
        queue_length = redis_client.llen(REDIS_LIST_KEY)

        # Send to client
        stats = {
            "total_messages": int(total_messages) if total_messages else 0,
            "current_rps": float(current_rps) if current_rps else 0.0,
            "messages_per_second": float(current_rps) if current_rps else 0.0,
            "queue_depth": queue_length,
            "total_batches": int(total_batches) if total_batches else 0,
            "avg_batch_size": round(avg_batch_size, 1),
            "timestamp": datetime.utcnow().isoformat(),
        }

        await websocket.send_json(stats)
        await asyncio.sleep(0.5)  # 500ms interval
```

### 2. Worker Processor ([backend/worker/processor.py](backend/worker/processor.py))

**Redis Metrics Initialization**
```python
def connect_redis(self):
    # Initialize metrics on startup
    if not self.redis_client.exists("total_messages"):
        self.redis_client.set("total_messages", 0)
    if not self.redis_client.exists("total_batches"):
        self.redis_client.set("total_batches", 0)
    if not self.redis_client.exists("current_rps"):
        self.redis_client.set("current_rps", 0)
```

**Metrics Update on Batch Flush**
```python
def update_redis_metrics(self, batch_size: int):
    # Increment total messages
    self.redis_client.incrby("total_messages", batch_size)

    # Increment total batches
    self.redis_client.incr("total_batches")

    # Calculate RPS (requests per second)
    current_time = time.time()
    self.rps_timestamps.append(current_time)

    # Remove timestamps older than 10 seconds
    cutoff_time = current_time - 10
    self.rps_timestamps = [ts for ts in self.rps_timestamps if ts > cutoff_time]

    # Calculate current RPS
    time_span = current_time - self.rps_timestamps[0]
    current_rps = len(self.rps_timestamps) / time_span if time_span > 0 else 0

    # Update Redis
    self.redis_client.set("current_rps", f"{current_rps:.2f}")
```

### 3. Frontend Hook ([frontend/hooks/useMessages.ts](frontend/hooks/useMessages.ts))

**WebSocket Connection**
```typescript
const connectWebSocket = useCallback(() => {
  const ws = new WebSocket('ws://localhost:8000/ws/stats');

  ws.onopen = () => {
    console.log('WebSocket connected');
    setWsConnected(true);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Update stats from WebSocket
    const newStats: SystemStats = {
      total_messages: data.total_messages || 0,
      queue_depth: data.queue_depth || 0,
      messages_per_second: data.messages_per_second || 0,
      total_batches: data.total_batches || 0,
      avg_batch_size: data.avg_batch_size || 0,
    };

    setStats(newStats);

    // Add to throughput history for chart
    setThroughputHistory((prev) => {
      const newPoint = {
        timestamp: new Date().toISOString(),
        time: new Date().toLocaleTimeString(),
        messages: newStats.messages_per_second,
      };
      return [...prev, newPoint].slice(-20); // Keep last 20 points
    });
  };

  ws.onclose = () => {
    // Auto-reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };
}, []);
```

**Hybrid Approach**
- **WebSocket**: Real-time stats every 500ms
- **HTTP Polling**: Messages and health check every 2 seconds

## Redis Keys

The worker maintains these keys in Redis:

| Key | Type | Description | Updated By |
|-----|------|-------------|------------|
| `total_messages` | Integer | Total messages processed | Worker on batch flush |
| `total_batches` | Integer | Total batches processed | Worker on batch flush |
| `current_rps` | Float | Current requests/sec (10s window) | Worker on batch flush |
| `pending_messages` | List | Queue of pending messages | API (LPUSH), Worker (BRPOP) |

## Data Flow

1. **Message Ingestion**
   - User sends POST to `/messages`
   - API validates and pushes to Redis `pending_messages` list

2. **Batch Processing**
   - Worker pulls from `pending_messages`
   - Batches 50 messages or waits 2 seconds
   - Inserts to PostgreSQL
   - Updates Redis metrics:
     - Increments `total_messages` by batch size
     - Increments `total_batches` by 1
     - Calculates and sets `current_rps`

3. **Real-Time Stats**
   - WebSocket endpoint reads Redis metrics every 500ms
   - Sends JSON to all connected clients
   - Dashboard updates Framer Motion components
   - Recharts gauge animates smoothly

## Testing the Implementation

### 1. Start Backend

```bash
cd infrastructure
docker-compose up --build

# Or locally
cd backend
./start.sh
```

### 2. Start Frontend

```bash
cd frontend
npm install  # First time only
npm run dev
```

### 3. Open Dashboard

Visit `http://localhost:3000` and check:
- WebSocket connection status in console: `"WebSocket connected"`
- Stats update every 500ms in the components
- Gauge and charts animate smoothly

### 4. Send Test Messages

```bash
# Send 100 messages to generate activity
for i in {1..100}; do
  curl -X POST http://localhost:8000/messages \
    -H "Content-Type: application/json" \
    -d "{\"user_id\": $i, \"channel_id\": 1, \"content\": \"Test $i\"}" &
done
wait
```

### 5. Observe Real-Time Updates

You should see:
- **Total Messages** incrementing in batches
- **Queue Depth** fluctuating
- **Throughput (RPS)** showing messages/second
- **Batches** incrementing
- **Chart** showing real-time throughput graph

## WebSocket Message Format

**Sent by Backend** (every 500ms):
```json
{
  "total_messages": 1234,
  "current_rps": 45.67,
  "messages_per_second": 45.67,
  "queue_depth": 12,
  "queue_length": 12,
  "total_batches": 25,
  "avg_batch_size": 49.3,
  "timestamp": "2024-01-17T12:34:56.789Z"
}
```

## Reconnection Logic

The frontend automatically reconnects if the WebSocket disconnects:

```typescript
ws.onclose = () => {
  console.log('WebSocket closed, reconnecting in 3s...');
  setTimeout(connectWebSocket, 3000);
};
```

## Performance Considerations

### Backend
- **500ms interval**: Good balance between real-time and server load
- **Async WebSocket**: Non-blocking, handles multiple clients
- **Redis reads**: Very fast, minimal overhead

### Frontend
- **Automatic reconnection**: Handles network issues gracefully
- **20-point chart limit**: Keeps memory usage low
- **Framer Motion layout**: Smooth animations without re-renders

## Monitoring

**Backend Logs**:
```bash
docker-compose logs -f api
# Look for: "WebSocket client connected"
```

**Frontend Console**:
```javascript
// Open browser DevTools Console
// Look for: "WebSocket connected"
// Check for incoming messages every 500ms
```

**Redis Monitoring**:
```bash
docker exec -it message-buffer redis-cli

# Check metrics
GET total_messages
GET total_batches
GET current_rps
LLEN pending_messages
```

## Troubleshooting

### WebSocket Won't Connect

1. **Check CORS**: Ensure `http://localhost:3000` is in allowed origins
2. **Check backend**: API should be running on port 8000
3. **Check browser console**: Look for WebSocket errors
4. **Test endpoint manually**: Use a WebSocket client to test `/ws/stats`

### Stats Not Updating

1. **Send messages**: Worker only updates metrics when processing batches
2. **Check Redis**: Verify keys exist: `redis-cli GET total_messages`
3. **Check worker logs**: Worker should log batch completions
4. **Check WebSocket data**: Console.log the incoming WebSocket data

### High CPU Usage

1. **Increase WebSocket interval**: Change from 500ms to 1000ms in `main.py`
2. **Limit chart data points**: Already limited to 20 in frontend
3. **Check for memory leaks**: Monitor browser DevTools Memory tab

## Environment Variables

**Backend** (set in docker-compose.yml or locally):
```env
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Frontend** (.env.local):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/stats
NEXT_PUBLIC_POLL_INTERVAL=2000
```

## Production Deployment

### Backend
- Use production ASGI server (Gunicorn + Uvicorn workers)
- Enable WebSocket compression
- Use Redis Sentinel for high availability
- Monitor WebSocket connection count

### Frontend
- Use `wss://` for secure WebSocket
- Update CORS to allow production domain
- Add authentication to WebSocket endpoint
- Implement heartbeat/ping-pong for connection health

---

**Built with**:
- FastAPI WebSockets
- Redis (metrics store)
- Next.js (frontend)
- Framer Motion (animations)
