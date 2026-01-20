# Quick Reference - Coordinated Backend + Frontend Update

## Backend Changes (main.py)

### 1. New Import
```python
import psycopg
from fastapi import BackgroundTasks
```

### 2. New Endpoint - GET /messages
```python
@app.get("/messages", response_model=List[MessageFromDB])
async def get_messages(limit: int = 50):
    # Returns last 50 messages from PostgreSQL
```

### 3. Fixed Endpoint - POST /simulate
```python
@app.post("/simulate")
async def run_simulation(background_tasks: BackgroundTasks):
    background_tasks.add_task(send_burst_messages)
    # Sends 500 messages immediately (no delays)
```

## Frontend Changes

### 1. lib/api.ts
```typescript
// Now uses real GET /messages endpoint (no more mock data)
export async function getRecentMessages(limit = 50): Promise<Message[]>
```

### 2. hooks/useMessages.ts
```typescript
// Persist last 100 chart points (never goes blank)
const updated = [...prev, newPoint].slice(-100);
```

### 3. app/page.tsx
```tsx
{/* Wrap each StatCard in aspect-video for perfect symmetry */}
<div className="aspect-video w-full">
  <StatCard ... />
</div>
```

### 4. components/StatCard.tsx
```tsx
// Fill parent container
className="relative group h-full w-full"
className="glass-card ... h-full w-full flex flex-col justify-between"
```

### 5. components/ThroughputGauge.tsx
```tsx
// Reduced padding for dense layout
className="glass-card p-4"      // was p-6
mb-4                             // was mb-6
h-40                             // was h-48
```

### 6. components/LiveFeed.tsx
```tsx
// Dense, data-packed appearance
className="glass-card p-4"       // was p-6
space-y-1.5                      // was space-y-2
max-h-[450px]                    // was max-h-[400px]
p-3                              // was p-4
```

## Testing Commands

```bash
# 1. Install backend dependencies
pip install psycopg

# 2. Restart backend
cd infrastructure && docker-compose up --build

# 3. Verify GET /messages
curl http://localhost:8000/messages?limit=10

# 4. Start frontend
cd frontend && npm run dev

# 5. Test simulation
# Click "Run Simulation" button
# Expect 500 messages injected instantly
# Throughput spike to 100-300 msg/s
```

## Expected Behavior

✅ Page load shows last 50 messages immediately
✅ All 4 stat cards identical dimensions (aspect-video)
✅ Chart maintains 100 data points (never goes blank)
✅ Simulation injects 500 messages in <1 second
✅ 30% more data visible (reduced padding)
✅ Dense, professional appearance

## File Checklist

- [ ] backend/api/main.py - Added psycopg, GET /messages, fixed POST /simulate
- [ ] frontend/lib/api.ts - Real endpoint (no mock data)
- [ ] frontend/hooks/useMessages.ts - 100-point persistence
- [ ] frontend/app/page.tsx - aspect-video wrappers
- [ ] frontend/components/StatCard.tsx - h-full w-full
- [ ] frontend/components/ThroughputGauge.tsx - Reduced padding
- [ ] frontend/components/LiveFeed.tsx - Dense layout
