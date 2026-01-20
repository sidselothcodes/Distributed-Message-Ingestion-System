'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, Zap } from 'lucide-react';

export default function DocsPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-discord-darker/80 border-b border-discord-light/20">
        <div className="container mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <motion.button
                whileHover={{ scale: 1.05, x: -5 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-discord-light/30 hover:bg-discord-light/50 text-discord-text transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </motion.button>
            </Link>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-blurple flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-discord-text">How It Works</span>
            </div>

            <div className="w-32" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-8 py-12 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-12"
        >
          {/* Hero */}
          <div className="text-center mb-16">
            <h1 className="text-4xl font-black text-discord-text mb-4">
              High-Speed Message Ingestor
            </h1>
            <p className="text-lg text-discord-muted">
              Processing 1,100+ messages per second with batched persistence
            </p>
            <p className="text-sm text-blurple-400 mt-2">
              Inspired by Discord's architecture
            </p>
          </div>

          {/* Architecture Diagram */}
          <section className="glass-card p-6">
            <h2 className="text-xl font-bold text-discord-text mb-4">Architecture</h2>
            <pre className="text-sm text-discord-text overflow-x-auto font-mono leading-relaxed">
{`Client → FastAPI → Redis Queue → Worker → PostgreSQL
                        ↓
                   Pub/Sub ──→ WebSocket ──→ Dashboard`}
            </pre>
          </section>

          {/* Key Stats */}
          <section>
            <h2 className="text-xl font-bold text-discord-text mb-4">Performance</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-card p-4 text-center">
                <div className="text-3xl font-bold text-blurple-400">1,100+</div>
                <div className="text-sm text-discord-muted">messages/sec</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div className="text-3xl font-bold text-blurple-400">&lt;100ms</div>
                <div className="text-sm text-discord-muted">P95 latency</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div className="text-3xl font-bold text-blurple-400">50x</div>
                <div className="text-sm text-discord-muted">fewer DB calls</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div className="text-3xl font-bold text-blurple-400">30s</div>
                <div className="text-sm text-discord-muted">max wait time</div>
              </div>
            </div>
          </section>

          {/* How Batching Works */}
          <section>
            <h2 className="text-xl font-bold text-discord-text mb-4">How Batching Works</h2>
            <div className="glass-card p-6 space-y-4">
              <p className="text-discord-text/90">
                Messages are flushed to PostgreSQL when either condition is met:
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-blurple-500/10 border border-blurple-500/20">
                  <div className="text-2xl font-bold text-blurple-400 mb-1">50 messages</div>
                  <div className="text-sm text-discord-muted">Volume trigger</div>
                </div>
                <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
                  <div className="text-2xl font-bold text-warning mb-1">30 seconds</div>
                  <div className="text-sm text-discord-muted">Time trigger</div>
                </div>
              </div>
              <p className="text-sm text-discord-muted">
                This ensures high throughput during traffic spikes while guaranteeing
                data durability during quiet periods.
              </p>
            </div>
          </section>

          {/* The Pipeline */}
          <section>
            <h2 className="text-xl font-bold text-discord-text mb-4">The Pipeline</h2>
            <div className="space-y-3">
              <Step number={1} title="Ingest">
                FastAPI validates the message, assigns a tracking ID, and pushes to Redis.
              </Step>
              <Step number={2} title="Buffer">
                Redis queue absorbs traffic spikes. Worker pulls messages with BRPOP.
              </Step>
              <Step number={3} title="Batch">
                Worker accumulates messages until 50 arrive or 30 seconds pass.
              </Step>
              <Step number={4} title="Persist">
                Single bulk INSERT to PostgreSQL. Publishes event to Redis Pub/Sub.
              </Step>
              <Step number={5} title="Notify">
                WebSocket broadcasts to frontend. Messages flip from yellow to green.
              </Step>
            </div>
          </section>

          {/* Key Challenges */}
          <section>
            <h2 className="text-xl font-bold text-discord-text mb-4">Challenges Solved</h2>
            <div className="space-y-3">
              <Challenge title="Queue depth showing 0 immediately">
                Worker syncs its internal buffer size back to Redis so the dashboard
                shows accurate counts.
              </Challenge>
              <Challenge title="Messages turning green too fast">
                Timer starts when first message arrives, not on last flush. Fixed
                docker-compose env override.
              </Challenge>
              <Challenge title="Real-time status updates">
                Redis Pub/Sub bridges worker events to WebSocket for instant UI updates.
              </Challenge>
            </div>
          </section>

          {/* Tech Stack */}
          <section>
            <h2 className="text-xl font-bold text-discord-text mb-4">Tech Stack</h2>
            <div className="glass-card p-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-discord-muted mb-2">BACKEND</h3>
                  <div className="space-y-1 text-discord-text/90">
                    <div>Python 3.11 + FastAPI</div>
                    <div>Redis (queue + pub/sub)</div>
                    <div>PostgreSQL</div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-discord-muted mb-2">FRONTEND</h3>
                  <div className="space-y-1 text-discord-text/90">
                    <div>Next.js 14 + TypeScript</div>
                    <div>Tailwind CSS</div>
                    <div>Framer Motion + Recharts</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className="text-center pt-8">
            <Link href="/">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="btn-blurple"
              >
                Try the Live Dashboard
              </motion.button>
            </Link>
          </div>

          {/* Footer */}
          <div className="text-center pt-8 border-t border-discord-light/20">
            <p className="text-sm text-discord-muted">
              Built by Siddarth Seloth
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-4 flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blurple-500/20 flex items-center justify-center text-blurple-400 font-bold">
        {number}
      </div>
      <div>
        <h3 className="font-bold text-discord-text">{title}</h3>
        <p className="text-sm text-discord-muted">{children}</p>
      </div>
    </div>
  );
}

function Challenge({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-4">
      <h3 className="font-bold text-discord-text mb-1">{title}</h3>
      <p className="text-sm text-discord-muted">{children}</p>
    </div>
  );
}
