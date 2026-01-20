'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getRecentMessages, checkHealth } from '@/lib/api';
import type { Message, HealthStatus, SystemStats, ThroughputDataPoint, PipelineMessage } from '@/lib/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/stats';
const BATCH_THRESHOLD = 50;
const RECONNECT_DELAYS = [1000, 2000, 5000];

const REALISTIC_MESSAGES = [
  "Hey everyone! How's it going?",
  "Just pushed the latest changes to main",
  "Can someone review my PR when they get a chance?",
  "The new feature is looking great!",
  "Anyone up for a quick sync?",
  "Just deployed to staging, testing now",
  "Found a bug in the auth flow, fixing it",
  "Great work on the dashboard!",
  "Need help with the API integration",
  "Coffee break anyone?",
  "The tests are passing now",
  "Updated the docs with the new endpoints",
  "Server's running smoothly",
  "Quick question about the database schema",
  "Just finished the code review",
  "Working on the performance optimization",
  "The metrics look good today",
  "Anyone seen this error before?",
  "Fixed the memory leak issue",
  "Ready for the demo tomorrow",
  "Just merged the feature branch",
  "Need to update the dependencies",
  "The pipeline is running faster now",
  "Check out the new monitoring dashboard",
  "Debugging the WebSocket connection",
  "The batch processing is working well",
  "Added more logging for debugging",
  "Optimized the database queries",
  "The cache hit rate improved",
  "Rolling back the last deployment",
  "All systems operational",
  "Investigating the latency spike",
  "The load balancer is configured correctly",
  "Scaling up the worker instances",
  "The queue is draining nicely",
];

export function useMessages(pollInterval = 2000) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pipelineMessages, setPipelineMessages] = useState<PipelineMessage[]>([]);
  const [throughputHistory, setThroughputHistory] = useState<ThroughputDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [hasReceivedData, setHasReceivedData] = useState(false);

  const [stats, setStats] = useState<SystemStats>({
    total_messages: 0,
    queue_depth: 0,
    messages_per_second: 0,
    total_batches: 0,
    avg_batch_size: 0,
    batch_threshold: 50,
    batch_progress: 0,
    batch_progress_percent: 0,
    batches_ready: 0,
    persisted_ids: [],
  });

  // Derive health status from WebSocket connection and received data
  const health: HealthStatus | null = wsConnected && hasReceivedData
    ? {
        status: 'healthy',
        redis: 'connected',
        queue_length: stats.queue_depth,
        batch_threshold: stats.batch_threshold,
        batch_progress: stats.batch_progress,
      }
    : wsConnected
      ? {
          status: 'connecting',
          redis: 'connecting',
          queue_length: 0,
        }
      : null;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const markMessagesAsPersisted = useCallback((persistedIds: string[], batchSize?: number) => {
    setPipelineMessages(prev => {
      if (persistedIds && persistedIds.length > 0) {
        const idsSet = new Set(persistedIds);
        // Count how many of our queued messages match the persisted IDs
        const matchingIds = prev.filter(msg => idsSet.has(msg.tracking_id) && msg.status === 'queued');
        const currentQueuedIds = prev.filter(msg => msg.status === 'queued').map(msg => msg.tracking_id);

        console.log('🔍 markMessagesAsPersisted called:', {
          receivedIdsCount: persistedIds.length,
          receivedIdsFirst5: persistedIds.slice(0, 5),
          currentQueuedCount: currentQueuedIds.length,
          currentQueuedFirst5: currentQueuedIds.slice(0, 5),
          matchingCount: matchingIds.length,
          matchingIds: matchingIds.map(m => m.tracking_id).slice(0, 5),
          timestamp: new Date().toISOString(),
        });

        if (matchingIds.length > 0) {
          console.log(`🟢 Marking ${matchingIds.length} messages as persisted (received ${persistedIds.length} IDs)`);
        } else {
          console.log(`⚠️ No matches found! Received IDs don't match any queued messages.`);
        }
        return prev.map(msg =>
          idsSet.has(msg.tracking_id) && msg.status === 'queued'
            ? { ...msg, status: 'persisted' }
            : msg
        );
      }
      return prev;
    });
  }, []);

  // Add messages with specific tracking IDs (from backend response)
  const addQueuedMessagesWithIds = useCallback((trackingIds: string[]) => {
    const newMessages: PipelineMessage[] = trackingIds.map((tracking_id) => ({
      tracking_id,
      user_id: Math.floor(Math.random() * 10000),
      channel_id: Math.floor(Math.random() * 100),
      content: REALISTIC_MESSAGES[Math.floor(Math.random() * REALISTIC_MESSAGES.length)],
      created_at: new Date().toISOString(),
      status: 'queued' as const,
    }));
    setPipelineMessages(prev => [...newMessages, ...prev].slice(0, 100));
  }, []);

  // Legacy function for backwards compatibility (generates local IDs)
  const addQueuedMessages = useCallback((count: number) => {
    const newMessages: PipelineMessage[] = Array.from({ length: count }).map((_, i) => ({
      tracking_id: `sim-${Date.now()}-${i}`,
      user_id: Math.floor(Math.random() * 10000),
      channel_id: Math.floor(Math.random() * 100),
      content: REALISTIC_MESSAGES[Math.floor(Math.random() * REALISTIC_MESSAGES.length)],
      created_at: new Date().toISOString(),
      status: 'queued' as const,
    }));
    setPipelineMessages(prev => [...newMessages, ...prev].slice(0, 100));
  }, []);

  // Use refs for callbacks to avoid recreating the WebSocket connection
  const markMessagesAsPersistedRef = useRef(markMessagesAsPersisted);
  markMessagesAsPersistedRef.current = markMessagesAsPersisted;

  useEffect(() => {
    isMountedRef.current = true;

    const connectWebSocket = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      if (wsRef.current) wsRef.current.close();

      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('✅ WebSocket connected');
          setWsConnected(true);
          setError(null);
          setLoading(false);
          reconnectAttemptRef.current = 0;
        };

        ws.onmessage = (event) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          try {
            const data = JSON.parse(event.data);

            // Handle batch_persisted events (sent immediately when worker completes)
            if (data.type === 'batch_persisted') {
              const ids = data.ids || [];
              if (ids.length > 0) {
                console.log('🟢 Batch persisted event received:', {
                  count: ids.length,
                  batch_id: data.batch_id,
                  batch_size: data.batch_size,
                  worker_timestamp: data.worker_timestamp,
                  received_at: new Date().toISOString(),
                  first_ids: ids.slice(0, 5),
                });
                markMessagesAsPersistedRef.current(ids, data.batch_size);
              }
              return; // This is a separate event, not a stats update
            }

            // Handle standard stats_update
            if (data.type === 'stats_update') {
              const newStats: SystemStats = {
                total_messages: data.total_messages ?? 0,
                queue_depth: data.queue_depth ?? 0,
                messages_per_second: data.messages_per_second ?? 0,
                total_batches: data.total_batches ?? 0,
                avg_batch_size: data.avg_batch_size ?? 0,
                batch_threshold: data.batch_threshold ?? BATCH_THRESHOLD,
                batch_progress: data.batch_progress ?? 0,
                batch_progress_percent: data.batch_progress_percent ?? 0,
                batches_ready: data.batches_ready ?? 0,
                persisted_ids: data.persisted_ids ?? [],
              };
              setStats(newStats);
              setHasReceivedData(true);

              // Update throughput history
              const now = new Date();
              setThroughputHistory(prev => [...prev, {
                timestamp: now.toISOString(),
                time: now.toLocaleTimeString(),
                messages: newStats.messages_per_second
              }].slice(-50));
            }

          } catch (err) {
            console.error('WS Parse Error:', err);
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (!isMountedRef.current) return;
          const delay = RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current++, RECONNECT_DELAYS.length - 1)];
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
        };

        ws.onerror = () => ws.close();

      } catch (err) {
        setWsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      }
    };

    connectWebSocket();

    return () => {
      isMountedRef.current = false;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []); // Empty dependency array - connection is stable across re-renders


  return {
    messages,
    pipelineMessages,
    health,
    stats,
    throughputHistory,
    loading,
    error,
    wsConnected,
    addQueuedMessages,
    addQueuedMessagesWithIds,
    clearMessages: () => setPipelineMessages([])
  };
}