# Frontend - Live Dashboard

Real-time message ingestion dashboard built with Next.js 14, TypeScript, and Tailwind CSS.

## Features

- **Live Message Feed**: Real-time streaming of incoming messages
- **Analytics Dashboard**: Visual metrics showing throughput, queue depth, and batch statistics
- **System Health**: Monitor API, Redis, and Worker status
- **Message Statistics**: User and channel activity breakdown

## Quick Start

### Initialize the Project

```bash
cd frontend

# Create Next.js 14 app with TypeScript and Tailwind
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"

# Install additional dependencies
npm install recharts lucide-react date-fns
npm install -D @types/node

# Install shadcn/ui for components (optional but recommended)
npx shadcn-ui@latest init
```

### Development

```bash
# Run the dev server
npm run dev

# Open http://localhost:3000
```

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Dashboard home
│   ├── globals.css          # Global styles
│   └── api/
│       └── messages/
│           └── route.ts     # API proxy to backend
├── components/
│   ├── Dashboard.tsx        # Main dashboard component
│   ├── LiveFeed.tsx         # Real-time message feed
│   ├── StatsCard.tsx        # Metric cards
│   ├── ThroughputChart.tsx  # Messages/second chart
│   └── HealthIndicator.tsx  # System health status
├── lib/
│   ├── api.ts               # API client
│   └── types.ts             # TypeScript types
├── hooks/
│   └── useMessages.ts       # Custom hook for message polling
└── public/
    └── ...                   # Static assets
```

## Component Architecture

### 1. Dashboard Layout
The main dashboard will display:
- System health indicators (API, Redis, Worker, PostgreSQL)
- Real-time throughput graph (messages per second)
- Queue depth meter
- Recent messages feed
- Statistics cards (total messages, batch count, avg batch size)

### 2. Data Fetching Strategy

**Option A: Polling (Simple)**
- Poll backend every 1-2 seconds for new messages
- Good for MVP, easy to implement
- Lower real-time accuracy

**Option B: Server-Sent Events (Better)**
- Backend streams updates to frontend
- True real-time updates
- More complex backend implementation

**Option C: WebSockets (Advanced)**
- Bi-directional real-time communication
- Best for production
- Most complex to implement

### 3. API Integration

Backend endpoints to consume:
- `GET /health` - System health check
- `GET /messages?limit=50` - Recent messages (you'll need to add this)
- `GET /stats` - Aggregated statistics (you'll need to add this)

## Next Steps

### Phase 1: Setup
1. Initialize Next.js project
2. Set up Tailwind CSS
3. Create basic layout and routing

### Phase 2: Static Dashboard
1. Build dashboard layout
2. Create mock data
3. Implement static components

### Phase 3: API Integration
1. Create API client
2. Add backend endpoints for stats
3. Connect components to real data

### Phase 4: Real-time Updates
1. Implement polling mechanism
2. Add WebSocket support (optional)
3. Optimize performance

### Phase 5: Polish
1. Add loading states
2. Error handling
3. Responsive design
4. Dark mode support

## Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Backend Extensions Needed

To support the dashboard, add these endpoints to the backend:

```python
# In api/main.py

@app.get("/messages")
async def get_recent_messages(limit: int = 50):
    # Query PostgreSQL for recent messages
    pass

@app.get("/stats")
async def get_stats():
    # Return aggregated statistics
    return {
        "total_messages": 1234,
        "queue_depth": 12,
        "messages_per_second": 45.2,
        "total_batches": 25,
        "avg_batch_size": 49.3
    }
```

## Design Inspiration

- Discord's Server Insights dashboard
- Grafana metrics visualization
- Vercel's deployment dashboard
- Railway's project dashboard

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React
- **UI Components**: shadcn/ui (optional)
- **State Management**: React Query (optional, for caching)

## Running with Docker (Future)

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Add to `infrastructure/docker-compose.yml`:
```yaml
frontend:
  build:
    context: ../frontend
    dockerfile: Dockerfile
  container_name: ingestor-dashboard
  ports:
    - "3000:3000"
  environment:
    NEXT_PUBLIC_API_URL: http://api:8000
  depends_on:
    - api
  networks:
    - ingestor-network
```
