import type { Message, HealthStatus, SystemStats } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function checkHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_URL}/health`, {
    cache: 'no-store',
  });
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

export async function runSimulation(count: number = 500) {
  const response = await fetch(`${API_URL}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
  if (!response.ok) throw new Error('Failed to start simulation');
  return response.json();
}

export async function getQueueStatus() {
  const response = await fetch(`${API_URL}/queue/status`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Failed to get queue status');
  return response.json();
}

export async function resetDatabase() {
  const response = await fetch(`${API_URL}/reset`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to reset database');
  return response.json();
}

// Fetch recent messages from PostgreSQL
export async function getRecentMessages(limit = 50): Promise<Message[]> {
  try {
    const response = await fetch(`${API_URL}/messages?limit=${limit}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      console.warn('Failed to fetch messages from API, returning empty array');
      return [];
    }
    const messages = await response.json();
    return messages;
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
}

// Mock function - replace with real API endpoint when available
export async function getStats(): Promise<SystemStats> {
  try {
    const response = await fetch(`${API_URL}/stats`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return generateMockStats();
    }
    return response.json();
  } catch (error) {
    return generateMockStats();
  }
}

// Mock stats for fallback
function generateMockStats(): SystemStats {
  return {
    total_messages: Math.floor(Math.random() * 10000) + 5000,
    queue_depth: Math.floor(Math.random() * 100),
    messages_per_second: Math.floor(Math.random() * 50) + 20,
    total_batches: Math.floor(Math.random() * 200) + 100,
    avg_batch_size: Math.floor(Math.random() * 10) + 45,
    uptime_seconds: Math.floor(Math.random() * 86400),
  };
}
