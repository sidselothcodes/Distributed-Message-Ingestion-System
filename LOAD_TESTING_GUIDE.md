# Load Testing Guide

Complete guide for stress-testing the high-speed message ingestor and verifying real-time dashboard metrics.

## Quick Start

```bash
# Install httpx for async requests
pip install httpx

# Run quick test (1000 messages, 50 concurrent)
python scripts/load_test.py --quick

# Run stress test (10,000 messages, 200 concurrent)
python scripts/load_test.py --stress

# Run extreme test (50,000 messages, 500 concurrent)
python scripts/load_test.py --extreme

# Custom test
python scripts/load_test.py --messages 5000 --concurrent 100
```

## Load Test Script Features

### Asynchronous Architecture
- Uses `asyncio` and `httpx` for non-blocking requests
- Configurable concurrency with semaphore control
- Thousands of requests without blocking

### Configurable Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--messages` | 1000 | Total messages to send |
| `--concurrent` | 50 | Max concurrent requests |
| `--url` | http://localhost:8000 | API endpoint |
| `--quick` | - | Preset: 1K messages, 50 concurrent |
| `--stress` | - | Preset: 10K messages, 200 concurrent |
| `--extreme` | - | Preset: 50K messages, 500 concurrent |

### Randomized Test Data

Each message includes:
- Random `user_id` (1-10,000)
- Random `channel_id` (1-100)
- Random content with unique suffix

### Progress Tracking

Real-time progress bar showing:
```
[████████████████████████████░░░░] 5000/10000 (50.0%) | Rate: 234 msg/s | Success: 4998 | Failed: 2 | ETA: 21s
```

### Success Metrics

After completion:
```
LOAD TEST RESULTS
================================================================================
Total Messages:       10,000
Successful Requests:  9,998 (99.98%)
Failed Requests:      2
Total Time Elapsed:   42.67s
Actual Throughput:    234.36 messages/second
Avg Response Time:    4.27ms per message
================================================================================
```

## Enhanced Worker Metrics

### 1. Improved RPS Calculation

**Old Implementation:**
- Tracked individual message timestamps
- Could be memory-intensive under high load
- Required list filtering on every batch

**New Implementation:**
```python
# Sliding window approach - more efficient
rps_window_size = 10  # 10 second window
rps_message_count = 0  # Messages in current window
rps_window_start = time.time()

# Reset window every 10 seconds
if time_since_window_start >= rps_window_size:
    current_rps = rps_message_count / time_since_window_start
    # Reset counters
```

**Benefits:**
- Lower memory footprint
- Smoother RPS curve during load tests
- More accurate during traffic spikes

### 2. Latency Tracking

**End-to-End Latency Measurement:**
```
Latency = Time from API receipt → DB commit
```

**Implementation:**
```python
def calculate_message_latencies(batch_data):
    for message in batch_data:
        created_at = parse_timestamp(message.created_at)
        latency_ms = (current_time - created_at) * 1000
        latencies.append(latency_ms)
    return latencies
```

**Metrics Stored in Redis:**

| Metric | Description |
|--------|-------------|
| `avg_latency_ms` | Average latency across last 100 messages |
| `p95_latency_ms` | 95th percentile (SLA monitoring) |
| `p99_latency_ms` | 99th percentile (outlier detection) |

**Dashboard Display:**
These metrics are automatically streamed via WebSocket and can be displayed in the dashboard.

## Running a Load Test

### Step 1: Start the Backend

```bash
cd infrastructure
docker-compose up --build
```

Or locally:
```bash
cd backend
./start.sh
```

### Step 2: Verify System Health

```bash
curl http://localhost:8000/health
```

Expected output:
```json
{
  "status": "healthy",
  "redis": "connected",
  "queue_length": 0
}
```

### Step 3: Open the Dashboard

```bash
cd frontend
npm run dev
```

Visit `http://localhost:3000` and keep it open during the test.

### Step 4: Run Load Test

```bash
# Quick test
python scripts/load_test.py --quick
```

### Step 5: Observe Real-Time Updates

Watch the dashboard for:
- **Total Messages** incrementing rapidly
- **Throughput chart** showing spike
- **Queue Depth** fluctuating
- **Batches** incrementing
- **Latency metrics** (if integrated into dashboard)

## Monitoring During Load Tests

### Worker Logs

```bash
docker-compose logs -f worker
```

Look for batch processing logs:
```
✓ Batch #42 saved successfully: 50 messages in 0.023s (2174 msg/s) | Total processed: 2100
```

### Redis Metrics

```bash
docker exec -it message-buffer redis-cli

# Check current metrics
GET total_messages
GET current_rps
GET avg_latency_ms
GET p95_latency_ms
GET p99_latency_ms
LLEN pending_messages
```

### PostgreSQL

```bash
docker exec -it message-db psql -U ingestor -d messages_db

# Count messages
SELECT COUNT(*) FROM messages;

# Check recent messages
SELECT * FROM messages ORDER BY inserted_at DESC LIMIT 10;

# Distribution by channel
SELECT channel_id, COUNT(*) FROM messages GROUP BY channel_id ORDER BY COUNT(*) DESC;
```

## Expected Results

### Quick Test (1K messages, 50 concurrent)

**Expected Metrics:**
- Duration: ~5-10 seconds
- Throughput: 100-200 msg/s
- Success Rate: >99%
- Avg Latency: <100ms
- P95 Latency: <200ms

### Stress Test (10K messages, 200 concurrent)

**Expected Metrics:**
- Duration: ~30-60 seconds
- Throughput: 200-400 msg/s
- Success Rate: >99%
- Avg Latency: <200ms
- P95 Latency: <500ms

### Extreme Test (50K messages, 500 concurrent)

**Expected Metrics:**
- Duration: ~2-5 minutes
- Throughput: 300-600 msg/s
- Success Rate: >98%
- Avg Latency: <500ms
- P95 Latency: <1000ms

## Troubleshooting

### Connection Errors

**Problem:** `Connection failed - is the API running?`

**Solution:**
```bash
# Check if API is running
curl http://localhost:8000/

# Check Docker containers
docker-compose ps

# Restart services
docker-compose restart api
```

### High Failure Rate

**Problem:** >5% failed requests

**Possible Causes:**
1. **Redis full** - Check memory: `docker stats message-buffer`
2. **PostgreSQL slow** - Check CPU: `docker stats message-db`
3. **Too many concurrent requests** - Reduce `--concurrent`

**Solutions:**
```bash
# Increase Redis memory
# Edit docker-compose.yml
redis:
  command: redis-server --maxmemory 512mb

# Scale worker horizontally
docker-compose up --scale worker=3
```

### Queue Building Up

**Problem:** `queue_length` keeps growing

**Solution:**
```bash
# Check worker logs
docker-compose logs -f worker

# Worker might be stuck - restart
docker-compose restart worker

# Add more workers
docker-compose up --scale worker=2 -d
```

### Latency Spikes

**Problem:** P99 latency >1000ms

**Possible Causes:**
1. Database locks
2. Network latency
3. Batch timeout too high

**Solutions:**
```bash
# Reduce batch size (faster commits)
# Set in docker-compose.yml
worker:
  environment:
    BATCH_SIZE: 25  # Instead of 50

# Reduce timeout
    BATCH_TIMEOUT: 1  # Instead of 2
```

## Performance Tuning

### Optimize for Throughput

**Goal:** Maximize messages/second

```yaml
# docker-compose.yml
worker:
  environment:
    BATCH_SIZE: 100  # Larger batches
    BATCH_TIMEOUT: 5  # Longer wait
```

**Trade-off:** Higher latency, better throughput

### Optimize for Latency

**Goal:** Minimize end-to-end latency

```yaml
worker:
  environment:
    BATCH_SIZE: 10   # Smaller batches
    BATCH_TIMEOUT: 0.5  # Quick flush
```

**Trade-off:** Lower throughput, better latency

### Scale Horizontally

```bash
# Run multiple workers
docker-compose up --scale worker=3

# Each worker pulls from same Redis queue
# Throughput increases ~linearly
```

## Advanced Load Testing

### Sustained Load Test

Test system stability over time:

```bash
# Send 100K messages over 10 minutes
python scripts/load_test.py --messages 100000 --concurrent 200
```

Monitor for:
- Memory leaks
- Connection pool exhaustion
- Queue backup
- Latency degradation

### Burst Load Test

Simulate traffic spikes:

```bash
# Quick burst
python scripts/load_test.py --messages 5000 --concurrent 500

# Wait 30 seconds

# Another burst
python scripts/load_test.py --messages 5000 --concurrent 500
```

Dashboard should show:
- Sharp spike in throughput
- Quick queue drain
- Return to baseline

## Dashboard Integration

### Add Latency Chart

Update [frontend/components/LatencyChart.tsx](frontend/components/LatencyChart.tsx):

```typescript
// Display latency metrics from WebSocket
const LatencyChart = ({ stats }) => {
  return (
    <div className="glass-card p-6">
      <h3>Latency Metrics</h3>
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Average" value={`${stats.avg_latency_ms}ms`} />
        <StatCard title="P95" value={`${stats.p95_latency_ms}ms`} />
        <StatCard title="P99" value={`${stats.p99_latency_ms}ms`} />
      </div>
    </div>
  );
};
```

### Update WebSocket Hook

Latency metrics are already included in the WebSocket stream:

```typescript
// hooks/useMessages.ts
stats = {
  // ... existing metrics
  avg_latency_ms: data.avg_latency_ms,
  p95_latency_ms: data.p95_latency_ms,
  p99_latency_ms: data.p99_latency_ms,
}
```

## Benchmarking Results

Test your system and record results:

```
System: MacBook Pro M1, 16GB RAM
Docker: 4 CPU, 8GB RAM allocated

Quick Test (1K messages, 50 concurrent):
- Duration: 4.2s
- Throughput: 238 msg/s
- Avg Latency: 42ms
- P95: 85ms
- P99: 120ms

Stress Test (10K messages, 200 concurrent):
- Duration: 38.5s
- Throughput: 260 msg/s
- Avg Latency: 156ms
- P95: 320ms
- P99: 485ms
```

## Next Steps

1. **Add Grafana Dashboard** - Visualize Redis metrics
2. **Add Prometheus Metrics** - Track system health
3. **Implement Circuit Breaker** - Handle overload gracefully
4. **Add Rate Limiting** - Protect API from abuse
5. **Database Indexing** - Optimize queries for dashboard

---

**Built for production-grade load testing of high-throughput message ingestion pipelines.**
