'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Database, Zap, TrendingUp, FileText, Github, CheckCircle, Send, Layers, Trash2 } from 'lucide-react';
import { useMessages } from '@/hooks/useMessages';
import { StatCard } from '@/components/StatCard';
import { HealthMonitor } from '@/components/HealthMonitor';
import { ThroughputGauge } from '@/components/ThroughputGauge';
import { LiveFeed } from '@/components/LiveFeed';
import { runSimulation, resetDatabase } from '@/lib/api';

export default function Dashboard() {
  const {
    messages,
    pipelineMessages,
    health,
    stats,
    throughputHistory,
    loading,
    error,
    addQueuedMessagesWithIds,
    clearMessages,
  } = useMessages(2000);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [messageCount, setMessageCount] = useState<string>('50');

  const handleRunSimulation = async () => {
    const count = parseInt(messageCount, 10);
    if (isNaN(count) || count < 1 || count > 10000) {
      setToastMessage('Please enter a number between 1 and 10,000');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    setSending(true);
    try {
      const result = await runSimulation(count);

      // Add queued messages to pipeline view using the actual tracking IDs from backend
      if (result.tracking_ids && result.tracking_ids.length > 0) {
        console.log('📤 Adding queued messages with IDs:', {
          count: result.tracking_ids.length,
          first_ids: result.tracking_ids.slice(0, 5),
          sent_at: new Date().toISOString(),
        });
        addQueuedMessagesWithIds(result.tracking_ids);
      }

      // Show success toast with batch info
      const batchInfo = result.expected_complete_batches > 0
        ? `${result.expected_complete_batches} batch(es) will flush, ${result.expected_remaining_queued} will remain queued`
        : `All ${count} messages will stay queued until batch threshold (50) is met`;

      setToastMessage(`Injecting ${count} messages! ${batchInfo}`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 5000);
    } catch (err) {
      console.error('Failed to run simulation:', err);
      setToastMessage('Failed to start simulation. Check backend connection.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } finally {
      setSending(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('This will delete all messages from the database and clear the queue. Continue?')) {
      return;
    }

    setResetting(true);
    try {
      const result = await resetDatabase();
      clearMessages(); // Clear the local pipeline view
      setToastMessage(`Reset complete! Deleted ${result.deleted_messages} messages, cleared ${result.cleared_queue} from queue.`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    } catch (err) {
      console.error('Failed to reset:', err);
      setToastMessage('Failed to reset database. Check backend connection.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="shimmer w-16 h-16 rounded-2xl mb-4 mx-auto" />
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-xl font-semibold text-discord-text"
          >
            Loading dashboard...
          </motion.div>
          <p className="text-sm text-discord-muted mt-2">
            Initializing high-speed monitoring
          </p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-8 max-w-md"
        >
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-4">
              <Database className="w-8 h-8 text-danger" />
            </div>
            <h2 className="text-xl font-bold text-discord-text mb-2">
              Connection Error
            </h2>
            <p className="text-discord-muted mb-4">{error}</p>
            <p className="text-sm text-discord-muted/60">
              Make sure the backend API is running at{' '}
              <code className="text-blurple-400 font-mono">
                {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}
              </code>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  const currentThroughput = stats?.messages_per_second || 0;
  const batchProgress = stats?.batch_progress || 0;
  const batchThreshold = stats?.batch_threshold || 50;
  const batchProgressPercent = stats?.batch_progress_percent || 0;

  return (
    <div className="min-h-screen">
      {/* Success Toast */}
      {showToast && (
        <motion.div
          initial={{ opacity: 0, y: -100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -100 }}
          className="fixed top-4 right-4 z-50 glass-card-strong p-4 border border-blurple-500/30 flex items-center gap-3 max-w-md"
        >
          <CheckCircle className="w-5 h-5 text-blurple-400 flex-shrink-0" />
          <span className="text-discord-text text-sm">{toastMessage}</span>
        </motion.div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-discord-darker/80 border-b border-discord-light/20">
        <div className="container mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ rotate: 10 }}
                className="w-10 h-10 rounded-xl bg-gradient-blurple flex items-center justify-center shadow-lg shadow-blurple-500/30"
              >
                <Zap className="w-5 h-5 text-white" />
              </motion.div>
              <span className="text-xl font-bold text-discord-text">Pipeline Simulator</span>
            </div>

            <div className="flex items-center gap-4">
              <Link href="/docs">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-discord-light/30 hover:bg-discord-light/50 text-discord-text transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Documentation</span>
                </motion.button>
              </Link>

              <motion.a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg bg-discord-light/30 hover:bg-discord-light/50 transition-colors"
              >
                <Github className="w-5 h-5 text-discord-text" />
              </motion.a>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-5xl mx-auto"
        >
          <h1 className="text-4xl md:text-6xl font-black mb-4 leading-tight">
            <span className="bg-gradient-to-r from-blurple-400 via-blurple-300 to-blurple-400 bg-clip-text text-transparent">
              Elastic Message
            </span>
            <br />
            <span className="text-discord-text">Ingestion Engine</span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-lg text-discord-muted mb-6 font-light max-w-2xl mx-auto"
          >
            A distributed pipeline engineered for ultra-low latency and high-reliability data persistence
          </motion.p>

          {/* Interactive Simulation Controls */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-6 max-w-xl mx-auto"
          >
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-blurple-400" />
              <h3 className="text-lg font-semibold text-discord-text">Simulation Controls</h3>
            </div>

            {/* Simulation Input Row - pixel-perfect alignment with h-[42px] */}
            <div className="flex items-center gap-4 pt-6">
              <div className="flex-1 relative">
                <label htmlFor="messageCount" className="absolute -top-5 left-0 text-xs text-discord-muted">
                  Messages (1-10,000)
                </label>
                <input
                  id="messageCount"
                  type="number"
                  min="1"
                  max="10000"
                  value={messageCount}
                  onChange={(e) => setMessageCount(e.target.value)}
                  placeholder="50"
                  className="w-full h-[42px] px-4 rounded-lg bg-discord-dark/60 border border-discord-light/30 focus:border-blurple-500/50 focus:outline-none text-discord-text placeholder-discord-muted/50 font-mono text-base leading-[42px]"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRunSimulation}
                disabled={sending}
                className="h-[42px] px-6 rounded-lg bg-gradient-blurple text-white font-semibold flex items-center justify-center gap-2 min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blurple-500/25 hover:shadow-blurple-500/40 transition-shadow whitespace-nowrap"
              >
                {sending ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>Send Messages</span>
                  </>
                )}
              </motion.button>
            </div>

            {/* Quick presets */}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-discord-muted">Quick:</span>
              {[10, 50, 100, 500].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setMessageCount(preset.toString())}
                  className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                    messageCount === preset.toString()
                      ? 'bg-blurple-500/30 text-blurple-400 border border-blurple-500/50'
                      : 'bg-discord-light/20 text-discord-muted hover:bg-discord-light/30'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Educational note */}
            <div className="mt-4 p-3 rounded-lg bg-blurple-500/10 border border-blurple-500/20">
              <p className="text-xs text-discord-muted">
                <span className="text-blurple-400 font-medium">Tip:</span> Try sending &lt;50 messages to see batching in action.
                Messages stay "Queued" in Redis until the batch threshold (50) is met or timeout (30s) occurs.
              </p>
            </div>
          </motion.div>

          {/* Tech badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="flex flex-wrap items-center justify-center gap-3 text-sm text-discord-muted/80 mt-6"
          >
            <TechBadge name="FastAPI" />
            <span className="text-discord-muted/40">•</span>
            <TechBadge name="Redis" />
            <span className="text-discord-muted/40">•</span>
            <TechBadge name="PostgreSQL" />
            <span className="text-discord-muted/40">•</span>
            <TechBadge name="Next.js" />
            <span className="text-discord-muted/40">•</span>
            <TechBadge name="WebSockets" />
          </motion.div>
        </motion.div>
      </section>

      {/* Dashboard Content */}
      <div className="container mx-auto px-8 pb-16 space-y-6">
        {/* Health Monitor */}
        <HealthMonitor health={health} />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Messages with Clear Database button */}
          <div className="aspect-video w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0 }}
              className="relative group h-full w-full"
            >
              <div className="glass-card p-4 relative overflow-hidden h-full w-full flex flex-col justify-between border-blurple-500/30">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-discord-muted mb-1">Total Messages</p>
                    <p className="text-xs text-discord-muted/60">Persisted to PostgreSQL</p>
                  </div>
                  <div className="p-2 rounded-xl bg-blurple-500/10">
                    <MessageSquare className="w-5 h-5 text-blurple-400" />
                  </div>
                </div>

                <motion.h3
                  key={stats?.total_messages || 0}
                  initial={{ scale: 1.1, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-3xl font-bold text-discord-text my-2"
                >
                  {(stats?.total_messages || 0).toLocaleString()}
                </motion.h3>

                {/* Clear Database Button - embedded */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleReset}
                  disabled={resetting}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs font-medium hover:bg-danger/20 transition-colors disabled:opacity-50"
                >
                  {resetting ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-3 h-3 border border-danger/30 border-t-danger rounded-full"
                      />
                      <span>Clearing...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3 h-3" />
                      <span>Clear Database</span>
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </div>

          {/* Queue Depth - shows messages waiting in Redis */}
          <div className="aspect-video w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative group h-full w-full"
            >
              <div className="glass-card p-4 relative overflow-hidden h-full w-full flex flex-col justify-between border-warning/30">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-discord-muted mb-1">Queue Depth</p>
                    <p className="text-xs text-discord-muted/60">Messages waiting in Redis</p>
                  </div>
                  <div className="p-2 rounded-xl bg-warning/10">
                    <Layers className="w-5 h-5 text-warning" />
                  </div>
                </div>

                <motion.h3
                  key={stats?.queue_depth || 0}
                  initial={{ scale: 1.1, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-3xl font-bold text-warning my-2"
                >
                  {(stats?.queue_depth || 0).toLocaleString()}
                </motion.h3>

                {/* Queue status indicator */}
                <div className="text-xs">
                  {(stats?.queue_depth || 0) > 0 ? (
                    <span className="text-warning">
                      Waiting for batch ({batchProgress}/{batchThreshold}) or 30s timeout
                    </span>
                  ) : (
                    <span className="text-discord-muted/60">Queue is empty</span>
                  )}
                </div>
              </div>
            </motion.div>
          </div>

          <div className="aspect-video w-full">
            <StatCard
              title="Throughput"
              value={`${currentThroughput}/s`}
              icon={Zap}
              subtitle="Messages per second"
              color="success"
              delay={0.2}
            />
          </div>

          {/* Total Batches with Progress Bar */}
          <div className="aspect-video w-full">
            <BatchStatCard
              totalBatches={stats?.total_batches || 0}
              batchProgress={batchProgress}
              batchThreshold={batchThreshold}
              batchProgressPercent={batchProgressPercent}
              avgBatchSize={stats?.avg_batch_size || 0}
            />
          </div>
        </div>

        {/* Charts and Feed Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Throughput Gauge */}
          <ThroughputGauge
            data={throughputHistory}
            currentThroughput={currentThroughput}
          />

          {/* Live Pipeline Feed */}
          <LiveFeed
            messages={messages}
            pipelineMessages={pipelineMessages}
            stats={stats}
          />
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center py-6 text-sm text-discord-muted"
        >
          <p>
            Developed by <span className="text-discord-text font-medium">Siddarth Seloth</span>, inspired by{' '}
            <a
              href="https://discord.com/blog/how-discord-stores-billions-of-messages"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blurple-400 hover:text-blurple-300 underline underline-offset-2 transition-colors"
            >
              Discord&apos;s Tech Blog
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function TechBadge({ name }: { name: string }) {
  return (
    <span className="px-3 py-1 rounded-full bg-discord-light/30 text-discord-text font-mono text-xs border border-blurple-500/40 shadow-sm shadow-blurple-500/20">
      {name}
    </span>
  );
}

function BatchStatCard({
  totalBatches,
  batchProgress,
  batchThreshold,
  batchProgressPercent,
  avgBatchSize,
}: {
  totalBatches: number;
  batchProgress: number;
  batchThreshold: number;
  batchProgressPercent: number;
  avgBatchSize: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="relative group h-full w-full"
    >
      <div className="glass-card p-4 relative overflow-hidden h-full w-full flex flex-col justify-between border-blurple-500/30">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-sm font-medium text-discord-muted mb-0.5">Total Batches</p>
            <p className="text-xs text-discord-muted/60">
              Avg {avgBatchSize.toFixed(0)} msgs/batch
            </p>
          </div>
          <div className="p-2 rounded-xl bg-blurple-500/10">
            <TrendingUp className="w-5 h-5 text-blurple-400" />
          </div>
        </div>

        {/* Value */}
        <div className="mb-2">
          <motion.h3
            key={totalBatches}
            initial={{ scale: 1.1, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-3xl font-bold text-discord-text"
          >
            {totalBatches.toLocaleString()}
          </motion.h3>
        </div>

        {/* Batch Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-discord-muted">Next batch progress</span>
            <span className="text-blurple-400 font-mono">{batchProgress}/{batchThreshold}</span>
          </div>
          <div className="h-2 bg-discord-dark/50 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blurple-500 to-blurple-400 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${batchProgressPercent}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
          {batchProgress > 0 && batchProgress < batchThreshold && (
            <p className="text-xs text-warning">
              {batchThreshold - batchProgress} more to trigger flush
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
