'use client';

import { motion } from 'framer-motion';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, TrendingUp } from 'lucide-react';
import type { ThroughputDataPoint } from '@/lib/types';

interface ThroughputGaugeProps {
  data: ThroughputDataPoint[];
  currentThroughput: number;
}

export function ThroughputGauge({ data, currentThroughput = 0 }: ThroughputGaugeProps) {
  // Ensure currentThroughput is always a valid number
  const safeThroughput = Number.isFinite(currentThroughput) ? currentThroughput : 0;

  // Guard against empty data array - Math.max(...[]) returns -Infinity
  const maxThroughput = data.length > 0
    ? Math.max(...data.map(d => d.messages ?? 0), 100)
    : 100;

  // Ensure percentage is always a valid number between 0-100
  const rawPercentage = maxThroughput > 0
    ? (safeThroughput / maxThroughput) * 100
    : 0;
  const percentage = Number.isFinite(rawPercentage)
    ? Math.min(Math.max(rawPercentage, 0), 100)
    : 0;

  // Pre-calculate circle position to ensure valid SVG attributes
  const angle = Math.PI - (Math.PI * percentage) / 100;
  const circleX = 100 + 70 * Math.cos(angle);
  const circleY = 100 - 70 * Math.sin(angle);

  // Sanitize chart data to ensure no undefined values reach Recharts
  const safeData = data.map(d => ({
    ...d,
    messages: d.messages ?? 0,
    time: d.time ?? '',
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      layout
      className="glass-card p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-discord-text mb-1">
            Live Throughput
          </h2>
          <p className="text-sm text-discord-muted">
            Messages processed per second
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <motion.div
              key={currentThroughput}
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="text-3xl font-bold text-blurple-400"
            >
              {currentThroughput}
            </motion.div>
            <div className="text-xs text-discord-muted">msg/sec</div>
          </div>

          <div className="p-3 rounded-xl bg-blurple-500/10">
            <Activity className="w-6 h-6 text-blurple-400" />
          </div>
        </div>
      </div>

      {/* Circular Progress Gauge */}
      <div className="mb-4">
        <div className="relative w-full h-32 flex items-center justify-center">
          <svg className="w-full h-full" viewBox="0 0 200 120">
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#5865F2" />
                <stop offset="100%" stopColor="#7d85ff" />
              </linearGradient>
            </defs>

            {/* Background arc - semicircle from left to right */}
            {/* Center: (100, 100), Radius: 70, from 180° to 0° */}
            <path
              d="M 30 100 A 70 70 0 0 1 170 100"
              fill="none"
              stroke="rgba(88, 101, 242, 0.15)"
              strokeWidth="14"
              strokeLinecap="round"
            />

            {/* Animated progress arc */}
            <motion.path
              d="M 30 100 A 70 70 0 0 1 170 100"
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth="14"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: percentage / 100 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{
                filter: 'drop-shadow(0 0 8px rgba(88, 101, 242, 0.5))',
              }}
            />

            {/* Indicator dot - follows the arc precisely */}
            {/* Arc center is (100, 100), radius 70 */}
            {/* At 0%: angle = π (180°), dot at (30, 100) */}
            {/* At 100%: angle = 0°, dot at (170, 100) */}
            <motion.circle
              r="8"
              fill="#ffffff"
              stroke="#5865F2"
              strokeWidth="3"
              initial={{ opacity: 0, cx: 30, cy: 100 }}
              animate={{
                opacity: 1,
                cx: circleX,
                cy: circleY,
              }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{
                filter: 'drop-shadow(0 0 6px rgba(88, 101, 242, 0.8))',
              }}
            />

            {/* Scale markers */}
            <text x="25" y="115" fontSize="10" fill="#949ba4" textAnchor="middle">0</text>
            <text x="100" y="25" fontSize="10" fill="#949ba4" textAnchor="middle">50</text>
            <text x="175" y="115" fontSize="10" fill="#949ba4" textAnchor="middle">100</text>
          </svg>

          {/* Center text - positioned in the arc */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ paddingTop: '20px' }}>
            <div className="text-center">
              <div className="text-xs text-discord-muted uppercase tracking-wider">Capacity</div>
              <motion.div
                key={percentage}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                className="text-3xl font-bold text-blurple-400"
              >
                {percentage.toFixed(0)}%
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Chart */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-blurple-400" />
          <h3 className="text-sm font-semibold text-discord-text">
            Real-time Activity
          </h3>
        </div>

        <div className="h-40 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={safeData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5865F2" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#5865F2" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(88, 101, 242, 0.1)"
                vertical={false}
              />

              <XAxis
                dataKey="time"
                stroke="#949ba4"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tickFormatter={(value) => {
                  // Extract HH:MM from time string for cleaner 24-hour display
                  const parts = value.split(':');
                  return `${parts[0]}:${parts[1]}`;
                }}
              />

              <YAxis
                stroke="#949ba4"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={[0, 'auto']}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(43, 45, 49, 0.95)',
                  border: '1px solid rgba(88, 101, 242, 0.3)',
                  borderRadius: '8px',
                  backdropFilter: 'blur(10px)',
                  color: '#dbdee1',
                }}
                labelStyle={{ color: '#949ba4', fontSize: '12px' }}
                itemStyle={{ color: '#5865F2', fontSize: '14px', fontWeight: 'bold' }}
              />

              <Area
                type="monotone"
                dataKey="messages"
                stroke="#5865F2"
                strokeWidth={2}
                fill="url(#colorMessages)"
                animationDuration={300}
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stats footer */}
      <div className="flex items-center justify-between pt-3 border-t border-discord-light/30">
        <div className="text-center">
          <div className="text-xs text-discord-muted">Peak</div>
          <div className="text-sm font-semibold text-discord-text">
            {maxThroughput} msg/s
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-discord-muted">Average</div>
          <div className="text-sm font-semibold text-discord-text">
            {safeData.length > 0
              ? Math.round(safeData.reduce((sum, d) => sum + d.messages, 0) / safeData.length)
              : 0}{' '}
            msg/s
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-discord-muted">Current</div>
          <div className="text-sm font-semibold text-blurple-400">
            {safeThroughput} msg/s
          </div>
        </div>
      </div>
    </motion.div>
  );
}
