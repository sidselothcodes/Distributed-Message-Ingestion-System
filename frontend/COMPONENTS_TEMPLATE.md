# Component Templates

After running `./setup.sh`, use these templates to build your dashboard.

## 1. lib/types.ts

```typescript
export interface Message {
  id?: number;
  user_id: number;
  channel_id: number;
  content: string;
  created_at: string;
  inserted_at?: string;
}

export interface HealthStatus {
  status: string;
  redis: string;
  queue_length: number;
}

export interface SystemStats {
  total_messages: number;
  queue_depth: number;
  messages_per_second: number;
  total_batches: number;
  avg_batch_size: number;
}
```

## 2. lib/api.ts

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function checkHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) throw new Error('Health check failed');
  return response.json();
}

export async function sendMessage(message: Omit<Message, 'id' | 'created_at'>) {
  const response = await fetch(`${API_URL}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!response.ok) throw new Error('Failed to send message');
  return response.json();
}

// TODO: Add these endpoints to backend
export async function getRecentMessages(limit = 50): Promise<Message[]> {
  const response = await fetch(`${API_URL}/messages?limit=${limit}`);
  if (!response.ok) throw new Error('Failed to fetch messages');
  return response.json();
}

export async function getStats(): Promise<SystemStats> {
  const response = await fetch(`${API_URL}/stats`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}
```

## 3. hooks/useMessages.ts

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getRecentMessages, checkHealth } from '@/lib/api';
import type { Message, HealthStatus } from '@/lib/types';

export function useMessages(pollInterval = 2000) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [messagesData, healthData] = await Promise.all([
          getRecentMessages(50),
          checkHealth(),
        ]);
        setMessages(messagesData);
        setHealth(healthData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, pollInterval);

    return () => clearInterval(interval);
  }, [pollInterval]);

  return { messages, health, loading, error };
}
```

## 4. components/HealthIndicator.tsx

```typescript
'use client';

import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import type { HealthStatus } from '@/lib/types';

interface Props {
  health: HealthStatus | null;
}

export function HealthIndicator({ health }: Props) {
  if (!health) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <AlertCircle className="w-5 h-5" />
        <span>Checking...</span>
      </div>
    );
  }

  const isHealthy = health.status === 'healthy' && health.redis === 'connected';

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        {isHealthy ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <XCircle className="w-5 h-5 text-red-500" />
        )}
        <span className={isHealthy ? 'text-green-500' : 'text-red-500'}>
          {isHealthy ? 'All Systems Operational' : 'System Issues'}
        </span>
      </div>
      <div className="text-sm text-gray-500">
        Queue: {health.queue_length} messages
      </div>
    </div>
  );
}
```

## 5. components/StatsCard.tsx

```typescript
'use client';

import { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export function StatsCard({ title, value, icon: Icon, trend }: Props) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
          {trend && (
            <p className={`text-sm mt-2 ${trend.isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <Icon className="w-12 h-12 text-gray-400" />
      </div>
    </div>
  );
}
```

## 6. components/LiveFeed.tsx

```typescript
'use client';

import { formatDistanceToNow } from 'date-fns';
import type { Message } from '@/lib/types';

interface Props {
  messages: Message[];
}

export function LiveFeed({ messages }: Props) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold">Live Message Feed</h2>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No messages yet. Send your first message!
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={msg.id || idx} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">User {msg.user_id}</span>
                    <span className="text-gray-500">in Channel {msg.channel_id}</span>
                  </div>
                  <p className="mt-1 text-gray-700 dark:text-gray-300">{msg.content}</p>
                </div>
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

## 7. app/page.tsx (Main Dashboard)

```typescript
'use client';

import { MessageSquare, Database, Zap, TrendingUp } from 'lucide-react';
import { useMessages } from '@/hooks/useMessages';
import { HealthIndicator } from '@/components/HealthIndicator';
import { StatsCard } from '@/components/StatsCard';
import { LiveFeed } from '@/components/LiveFeed';

export default function Dashboard() {
  const { messages, health, loading, error } = useMessages(2000);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Message Ingestor Dashboard</h1>
          <HealthIndicator health={health} />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Total Messages"
            value={messages.length}
            icon={MessageSquare}
          />
          <StatsCard
            title="Queue Depth"
            value={health?.queue_length || 0}
            icon={Database}
          />
          <StatsCard
            title="Throughput"
            value="~50/s"
            icon={Zap}
          />
          <StatsCard
            title="Batches Processed"
            value="--"
            icon={TrendingUp}
          />
        </div>

        {/* Live Feed */}
        <LiveFeed messages={messages} />
      </div>
    </div>
  );
}
```

## Usage

1. Run `./setup.sh` to initialize Next.js
2. Create the files above in their respective locations
3. Start the backend: `cd ../infrastructure && docker-compose up`
4. Start the frontend: `npm run dev`
5. Open http://localhost:3000

## Next: Add Backend Endpoints

To make the dashboard fully functional, add these to `backend/api/main.py`:

```python
@app.get("/messages")
async def get_recent_messages(limit: int = 50):
    """Get recent messages from PostgreSQL"""
    if pg_conn is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        with pg_conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, user_id, channel_id, content, created_at, inserted_at "
                "FROM messages ORDER BY inserted_at DESC LIMIT %s",
                (limit,)
            )
            messages = cursor.fetchall()
            return [
                {
                    "id": row[0],
                    "user_id": row[1],
                    "channel_id": row[2],
                    "content": row[3],
                    "created_at": row[4].isoformat(),
                    "inserted_at": row[5].isoformat()
                }
                for row in messages
            ]
    except Exception as e:
        logger.error(f"Failed to fetch messages: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch messages")
```
