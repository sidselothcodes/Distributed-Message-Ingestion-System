# Building a High-Speed Message Ingestor

**A Technical Deep Dive into Distributed Pipeline Engineering**

*Inspired by [Discord's architecture](https://discord.com/blog/how-discord-stores-billions-of-messages) for handling billions of messages*

---

## The Problem

Modern real-time applications demand immediate acknowledgment of user actions while ensuring data durability. The naive approach—writing directly to a database on every request—creates a tight coupling that crumbles under load. When traffic spikes, your database becomes the bottleneck, latency climbs, and users experience failures.

I wanted to build something better: a pipeline that **decouples ingestion from persistence**, handles traffic bursts gracefully, and provides real-time visibility into the entire data lifecycle.

---

## Architecture Overview

```
┌──────────────┐      ┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Clients    │─────▶│  FastAPI    │─────▶│    Redis     │─────▶│   Worker    │
│  (Frontend)  │ POST │  Ingestor   │ LPUSH│   Buffer     │ BRPOP│  (Batcher)  │
└──────────────┘      └─────────────┘      └──────────────┘      └─────────────┘
       ▲                                          │                      │
       │                                          │                      ▼
       │              ┌─────────────────────────────┐            ┌─────────────┐
       │              │     Redis Pub/Sub           │            │ PostgreSQL  │
       └──────────────│  (batch_notifications)      │◀───────────│  (Durable)  │
        WebSocket     └─────────────────────────────┘  PUBLISH   └─────────────┘
```

### Core Components

| Component | Responsibility |
|-----------|---------------|
| **FastAPI Ingestor** | Validates payloads, assigns tracking IDs, pushes to Redis queue |
| **Redis Buffer** | Absorbs traffic spikes, decouples write-path from persistence |
| **Batch Worker** | Pulls messages, accumulates batches, bulk-inserts to PostgreSQL |
| **Redis Pub/Sub** | Broadcasts persistence events back to connected clients |
| **Next.js Dashboard** | Real-time visualization with WebSocket state reconciliation |

---

## Performance Results

After iterating through several architectural challenges (detailed below), the pipeline achieved:

| Metric | Value |
|--------|-------|
| **Peak Throughput** | 1,100+ msg/s |
| **Batch Efficiency** | 50x reduction in DB operations |
| **P95 Latency** | < 100ms (message creation to persistence) |
| **Database Operations** | ~22/s at 1,100 msg/s throughput |

The key insight: **batching transforms N database round-trips into 1**, and the efficiency gains compound as throughput increases.

---

## The Temporal Windowing Strategy

One of the trickiest design decisions was determining *when* to flush accumulated messages to PostgreSQL. I implemented a **dual-trigger mechanism**:

### Trigger 1: Volume Threshold (50 messages)
When the buffer accumulates 50 messages, flush immediately. This optimizes for high-traffic scenarios where batches fill quickly.

### Trigger 2: Time Threshold (30 seconds)
When the first message of a batch arrives, a 30-second timer starts. If the volume threshold isn't reached within this window, flush anyway. This ensures **data durability during low-traffic periods**—messages don't sit in volatile Redis memory indefinitely.

```python
def should_flush(self) -> bool:
    # Volume trigger
    if len(self.message_buffer) >= BATCH_SIZE:
        return True

    # Time trigger - starts from FIRST message, not last flush
    if self.batch_start_time is not None:
        elapsed = time.time() - self.batch_start_time
        if elapsed >= BATCH_TIMEOUT:
            return True

    return False
```

**Critical implementation detail**: The timer starts when the *first message of a new batch arrives*, not from the last flush. This prevents a pathological case where a single message could wait indefinitely if `batch_start_time` was set at flush completion.

---

## Solving the "In-Flight Data" Visibility Gap

### The Problem

Early in development, I noticed a confusing UX issue: when users sent messages, the queue depth would briefly spike, then immediately drop to zero—even though the messages hadn't been persisted yet.

The root cause: Redis `BRPOP` is destructive. When the worker pulls a message from the queue, it's removed from Redis immediately. The message now lives only in the worker's in-memory buffer, invisible to the API's queue depth queries.

```
User sends 5 messages → Queue shows 5 → Worker BRPOP → Queue shows 0
                                                        ↑
                                        Messages are in worker buffer,
                                        but API doesn't know this!
```

### The Solution: Unified Pipeline View

I introduced a **worker buffer synchronization** mechanism. The worker now writes its internal buffer size to a Redis metadata key after each message pull:

```python
# Worker: after adding message to buffer
self.redis_client.set("worker_buffer_size", len(self.message_buffer))
self.redis_client.set("batch_start_time", self.batch_start_time)
```

The API combines both sources to report true queue depth:

```python
# API: WebSocket stats broadcast
redis_queue_depth = redis_client.llen("pending_messages")
worker_buffer_size = int(redis_client.get("worker_buffer_size") or 0)
total_queue_depth = redis_queue_depth + worker_buffer_size
```

Now the dashboard shows a **unified pipeline view**—messages are tracked from the moment they're queued until they're persisted, regardless of which component currently holds them.

---

## WebSocket State Reconciliation

The final piece was closing the loop: how does the frontend know when specific messages transition from "Queued" to "Persisted"?

### The Challenge

Polling the database would work but introduces latency and unnecessary load. I needed push-based notifications that include the exact message IDs that were just persisted.

### The Solution: Redis Pub/Sub Bridge

When the worker successfully commits a batch to PostgreSQL, it publishes an event to a Redis Pub/Sub channel:

```python
# Worker: after successful batch commit
batch_event = {
    "type": "persisted",
    "batch_id": batch_id,
    "ids": persisted_tracking_ids,  # The magic: exact IDs
    "batch_size": len(batch),
    "timestamp": datetime.utcnow().isoformat()
}
redis_client.publish("batch_notifications", json.dumps(batch_event))
```

The API server subscribes to this channel and forwards events to connected WebSocket clients:

```python
# API: WebSocket handler
pubsub = redis_client.pubsub()
pubsub.subscribe("batch_notifications")

message = pubsub.get_message(ignore_subscribe_messages=True)
if message and message['type'] == 'message':
    batch_event = json.loads(message['data'])
    await websocket.send_json({
        "type": "batch_persisted",
        "ids": batch_event.get('ids', []),
        "batch_size": batch_event.get('batch_size', 0)
    })
```

The frontend receives these events and updates its local state:

```typescript
// Frontend: WebSocket message handler
if (data.type === 'batch_persisted') {
    const persistedIds = new Set(data.ids);
    setPipelineMessages(prev =>
        prev.map(msg =>
            persistedIds.has(msg.tracking_id) && msg.status === 'queued'
                ? { ...msg, status: 'persisted' }
                : msg
        )
    );
}
```

The result: **instant visual feedback** when batches are persisted, with message cards flipping from yellow (Queued) to green (Persisted) in real-time.

---

## Project Structure

```
high-speed-ingestor/
├── backend/
│   ├── api/
│   │   └── main.py              # FastAPI + WebSocket handler
│   ├── worker/
│   │   └── processor.py         # Batch processor with dual-trigger
│   ├── Dockerfile.api
│   ├── Dockerfile.worker
│   └── requirements.txt
│
├── frontend/
│   ├── app/page.tsx             # Dashboard UI
│   ├── components/
│   │   ├── LiveFeed.tsx         # Pipeline message visualization
│   │   ├── ThroughputGauge.tsx  # Real-time metrics
│   │   └── StatCard.tsx         # Metric cards
│   ├── hooks/
│   │   └── useMessages.ts       # WebSocket + state management
│   └── lib/
│       ├── api.ts               # REST client
│       └── types.ts             # TypeScript definitions
│
├── infrastructure/
│   ├── docker-compose.yml       # Full stack orchestration
│   └── init.sql                 # PostgreSQL schema
│
└── README.md
```

---

## Quick Start

### Docker Compose (Recommended)

```bash
cd infrastructure
docker-compose up --build

# In another terminal
cd frontend
npm install && npm run dev
```

Services:
- **Dashboard**: http://localhost:3000
- **API**: http://localhost:8000
- **Redis**: localhost:6379
- **PostgreSQL**: localhost:5432

### Local Development

```bash
# Start infrastructure only
cd infrastructure
docker-compose up redis postgres -d

# Run backend services locally
cd ../backend
pip install -r requirements.txt
./start.sh both  # or: ./start.sh api | ./start.sh worker

# Run frontend
cd ../frontend
npm run dev
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BATCH_SIZE` | 50 | Messages per batch (volume trigger) |
| `BATCH_TIMEOUT` | 30 | Seconds before timeout flush (time trigger) |
| `REDIS_HOST` | localhost | Redis connection |
| `POSTGRES_HOST` | localhost | PostgreSQL connection |

---

## API Reference

### Ingest Messages

```bash
# Single message
curl -X POST http://localhost:8000/messages \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "channel_id": 1, "content": "Hello, pipeline!"}'

# Burst simulation
curl -X POST http://localhost:8000/simulate \
  -H "Content-Type: application/json" \
  -d '{"count": 100}'
```

### System Operations

```bash
# Health check
curl http://localhost:8000/health

# Queue status
curl http://localhost:8000/queue/status

# Reset database (clears all data)
curl -X DELETE http://localhost:8000/reset
```

### WebSocket

Connect to `ws://localhost:8000/ws/stats` for real-time updates:

```json
// Stats update (every 500ms)
{"type": "stats_update", "total_messages": 1234, "queue_depth": 5, ...}

// Batch persisted event (on each flush)
{"type": "batch_persisted", "ids": ["abc123", "def456"], "batch_size": 50}
```

---

## Key Learnings

1. **Environment variables override defaults silently.** I spent time debugging why messages persisted in 2 seconds instead of 30—turned out `docker-compose.yml` had `BATCH_TIMEOUT: 2` hardcoded.

2. **Destructive operations (BRPOP) create visibility gaps.** Always maintain metadata about in-flight data if you need to report accurate queue depth.

3. **Timer semantics matter.** "30 seconds since last flush" vs "30 seconds since first message arrived" have very different behaviors during low traffic.

4. **Pub/Sub is ephemeral.** Redis Pub/Sub doesn't store messages—if no one's subscribed, events are lost. This is fine for real-time notifications but not for guaranteed delivery.

---

## Tech Stack

**Backend**: Python 3.11, FastAPI, Redis, PostgreSQL, psycopg2

**Frontend**: Next.js 14, TypeScript, Tailwind CSS, Framer Motion, Recharts

**Infrastructure**: Docker, Docker Compose

---

## Future Improvements

- [ ] Horizontal worker scaling with partition-aware batching
- [ ] Dead-letter queue for failed persistence attempts
- [ ] Prometheus metrics + Grafana dashboards
- [ ] Message deduplication layer
- [ ] Kubernetes deployment manifests

---

## License

MIT

---

*Built by Siddarth Seloth*
