export interface Message {
  id?: number;
  tracking_id?: string;
  user_id: number;
  channel_id: number;
  content: string;
  created_at: string;
  inserted_at?: string;
  status?: 'queued' | 'persisted';  // Lifecycle status
}

export interface HealthStatus {
  status: string;
  redis: string;
  queue_length: number;
  batch_threshold?: number;
  batch_progress?: number;
}

export interface SystemStats {
  total_messages: number;
  queue_depth: number;
  messages_per_second: number;
  total_batches: number;
  avg_batch_size: number;
  uptime_seconds?: number;
  // Batch lifecycle tracking
  batch_threshold?: number;
  batch_progress?: number;
  batch_progress_percent?: number;
  batches_ready?: number;
  // Persisted message IDs for status updates
  persisted_ids?: string[];
}

export interface ThroughputDataPoint {
  timestamp: string;
  time: string;
  messages: number;
}

export interface ChartDataPoint {
  name: string;
  value: number;
}

export interface BatchEvent {
  type: 'batch_completed';
  batch_id: string;
  batch_size: number;
  completed_at: string;
  total_batches: number;
}

export interface PipelineMessage {
  tracking_id: string;
  user_id: number;
  channel_id: number;
  content: string;
  created_at: string;
  status: 'queued' | 'persisted';
}
