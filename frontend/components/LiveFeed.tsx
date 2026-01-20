'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, User, Hash, Clock, Database, Layers, ArrowRight } from 'lucide-react';
import type { Message, PipelineMessage, SystemStats } from '@/lib/types';

interface LiveFeedProps {
  messages: Message[];
  pipelineMessages: PipelineMessage[];
  stats: SystemStats | null;
}

export function LiveFeed({ messages, pipelineMessages, stats }: LiveFeedProps) {
  const hasMessages = pipelineMessages.length > 0 || messages.length > 0;
  const queuedCount = pipelineMessages.filter(m => m.status === 'queued').length;
  const persistedCount = pipelineMessages.filter(m => m.status === 'persisted').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      layout
      className="glass-card p-4 h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blurple-500/10">
            <Layers className="w-5 h-5 text-blurple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-discord-text">
              Live Pipeline View
            </h2>
            <p className="text-xs text-discord-muted">
              Message lifecycle tracking
            </p>
          </div>
        </div>

        {/* Status Summary */}
        <div className="flex items-center gap-3">
          {queuedCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-warning/10 border border-warning/30">
              <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              <span className="text-xs font-medium text-warning">{queuedCount} Queued</span>
            </div>
          )}
          {persistedCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 border border-success/30">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-xs font-medium text-success">{persistedCount} Persisted</span>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Flow Indicator */}
      <div className="flex items-center justify-center gap-2 py-2 mb-3 border-y border-discord-light/20">
        <div className="flex items-center gap-1.5 text-xs text-discord-muted">
          <div className="w-6 h-6 rounded bg-blurple-500/20 flex items-center justify-center">
            <MessageSquare className="w-3 h-3 text-blurple-400" />
          </div>
          <span>API</span>
        </div>
        <ArrowRight className="w-3 h-3 text-discord-muted" />
        <div className="flex items-center gap-1.5 text-xs text-discord-muted">
          <div className="w-6 h-6 rounded bg-warning/20 flex items-center justify-center">
            <Layers className="w-3 h-3 text-warning" />
          </div>
          <span>Redis Queue</span>
        </div>
        <ArrowRight className="w-3 h-3 text-discord-muted" />
        <div className="flex items-center gap-1.5 text-xs text-discord-muted">
          <div className="w-6 h-6 rounded bg-success/20 flex items-center justify-center">
            <Database className="w-3 h-3 text-success" />
          </div>
          <span>PostgreSQL</span>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 space-y-1.5 max-h-[380px] overflow-y-auto pr-2 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {!hasMessages ? (
            <EmptyState />
          ) : (
            <>
              {/* Pipeline Messages (with lifecycle status) */}
              {pipelineMessages.map((message, index) => (
                <PipelineMessageItem
                  key={message.tracking_id}
                  message={message}
                  index={index}
                />
              ))}

              {/* Persisted Messages from DB (if no pipeline messages) */}
              {pipelineMessages.length === 0 && messages.map((message, index) => (
                <PersistedMessageItem
                  key={message.id || `db-${index}`}
                  message={message}
                  index={index}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Batch Info Footer */}
      {stats && (
        <div className="mt-3 pt-3 border-t border-discord-light/20">
          <div className="flex items-center justify-between text-xs">
            <span className="text-discord-muted">
              Batch threshold: {stats.batch_threshold || 50} messages
            </span>
            <span className="text-discord-muted">
              Queue depth: <span className="text-blurple-400 font-medium">{stats.queue_depth}</span>
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Wrap EmptyState with forwardRef to fix Framer Motion ref warning
const EmptyState = forwardRef<HTMLDivElement>(function EmptyState(_, ref) {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      {/* Pipeline Illustration */}
      <div className="flex items-center gap-3 mb-6">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-12 h-12 rounded-xl bg-blurple-500/20 flex items-center justify-center border border-blurple-500/30"
        >
          <MessageSquare className="w-6 h-6 text-blurple-400" />
        </motion.div>
        <motion.div
          animate={{ x: [0, 5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-discord-muted"
        >
          <ArrowRight className="w-5 h-5" />
        </motion.div>
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
          className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center border border-warning/30"
        >
          <Layers className="w-6 h-6 text-warning" />
        </motion.div>
        <motion.div
          animate={{ x: [0, 5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
          className="text-discord-muted"
        >
          <ArrowRight className="w-5 h-5" />
        </motion.div>
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}
          className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center border border-success/30"
        >
          <Database className="w-6 h-6 text-success" />
        </motion.div>
      </div>

      <h3 className="text-lg font-semibold text-discord-text mb-2">
        No Active Data Pipeline
      </h3>
      <p className="text-sm text-discord-muted max-w-xs">
        Enter a message count above and click "Send Messages" to start the simulation and watch the pipeline in action.
      </p>

      {/* Educational Note */}
      <div className="mt-6 p-3 rounded-lg bg-blurple-500/10 border border-blurple-500/20 max-w-sm">
        <p className="text-xs text-discord-muted">
          <span className="text-blurple-400 font-medium">Tip:</span> Send fewer than 50 messages to see them stay "Queued" until the batch threshold is met or timeout occurs.
        </p>
      </div>
    </motion.div>
  );
});

const PipelineMessageItem = forwardRef<HTMLDivElement, { message: PipelineMessage; index: number }>(
  function PipelineMessageItem({ message, index }, ref) {
    const isQueued = message.status === 'queued';

    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, x: -20, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 20, scale: 0.95 }}
        transition={{
          duration: 0.3,
          delay: Math.min(index * 0.02, 0.2),
          layout: { duration: 0.3 },
        }}
        className={`
          message-item p-3 rounded-lg backdrop-blur-sm cursor-pointer group
          ${isQueued
            ? 'bg-warning/5 border border-warning/20 hover:border-warning/40'
            : 'bg-success/5 border border-success/20 hover:border-success/40'
          }
        `}
      >
        <div className="flex items-start gap-3">
          {/* Status Badge */}
          <div className="flex-shrink-0 mt-0.5">
            {isQueued ? (
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center"
              >
                <Layers className="w-4 h-4 text-warning" />
              </motion.div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                <Database className="w-4 h-4 text-success" />
              </div>
            )}
          </div>

          {/* Message Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <StatusBadge status={message.status} />

              <span className="text-xs text-discord-muted">
                ID: {message.tracking_id}
              </span>

              <div className="flex items-center gap-1 ml-auto">
                <User className="w-3 h-3 text-discord-muted" />
                <span className="text-xs text-discord-muted">{message.user_id}</span>
              </div>
            </div>

            {/* Content */}
            <p className="text-sm text-discord-text/90 truncate">
              {message.content}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }
);

const PersistedMessageItem = forwardRef<HTMLDivElement, { message: Message; index: number }>(
  function PersistedMessageItem({ message, index }, ref) {
    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{
          duration: 0.3,
          delay: Math.min(index * 0.02, 0.2),
        }}
        className="message-item p-3 rounded-lg bg-discord-dark/50 backdrop-blur-sm border border-discord-light/20 hover:border-blurple-500/30 cursor-pointer group"
      >
        <div className="flex items-start gap-3">
          {/* Persisted Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
              <Database className="w-4 h-4 text-success" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <StatusBadge status="persisted" />

              <div className="flex items-center gap-1">
                <User className="w-3 h-3 text-discord-muted" />
                <span className="text-xs text-discord-muted">{message.user_id}</span>
              </div>

              <div className="flex items-center gap-1">
                <Hash className="w-3 h-3 text-discord-muted" />
                <span className="text-xs text-discord-muted">{message.channel_id}</span>
              </div>

              {message.created_at && (
                <div className="flex items-center gap-1 ml-auto">
                  <Clock className="w-3 h-3 text-discord-muted" />
                  <span className="text-xs text-discord-muted">
                    {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                  </span>
                </div>
              )}
            </div>

            <p className="text-sm text-discord-text/90 truncate">
              {message.content}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }
);

function StatusBadge({ status }: { status: 'queued' | 'persisted' }) {
  if (status === 'queued') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/20 border border-warning/30">
        <motion.div
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-warning"
        />
        <span className="text-xs font-medium text-warning">Queued</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/20 border border-success/30">
      <div className="w-1.5 h-1.5 rounded-full bg-success" />
      <span className="text-xs font-medium text-success">Persisted</span>
    </span>
  );
}
