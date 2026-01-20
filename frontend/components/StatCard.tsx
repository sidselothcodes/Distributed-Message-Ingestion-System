'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blurple' | 'success' | 'danger' | 'warning';
  delay?: number;
}

const colorVariants = {
  blurple: {
    border: 'border-blurple-500/30',
    iconBg: 'bg-blurple-500/10',
    iconColor: 'text-blurple-400',
    trendPositive: 'text-blurple-400',
    trendNegative: 'text-danger',
  },
  success: {
    border: 'border-success/30',
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
    trendPositive: 'text-success',
    trendNegative: 'text-danger',
  },
  danger: {
    border: 'border-danger/30',
    iconBg: 'bg-danger/10',
    iconColor: 'text-danger',
    trendPositive: 'text-success',
    trendNegative: 'text-danger',
  },
  warning: {
    border: 'border-warning/30',
    iconBg: 'bg-warning/10',
    iconColor: 'text-warning',
    trendPositive: 'text-success',
    trendNegative: 'text-danger',
  },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  color = 'blurple',
  delay = 0,
}: StatCardProps) {
  const colors = colorVariants[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      layout
      className="relative group h-full w-full"
    >
      {/* Glassmorphism Card */}
      <div
        className={`
          glass-card p-6 relative overflow-hidden h-full w-full
          transition-all duration-300 hover:scale-[1.02]
          flex flex-col justify-between
          ${colors.border}
        `}
      >
        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-blurple-500/0 to-blurple-500/0 group-hover:from-blurple-500/5 group-hover:to-transparent transition-all duration-300" />

        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            {/* Title */}
            <div>
              <p className="text-sm font-medium text-discord-muted mb-1">
                {title}
              </p>
              {subtitle && (
                <p className="text-xs text-discord-muted/60">{subtitle}</p>
              )}
            </div>

            {/* Icon */}
            <motion.div
              whileHover={{ rotate: 10, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 300 }}
              className={`
                p-3 rounded-xl ${colors.iconBg}
                backdrop-blur-sm
              `}
            >
              <Icon className={`w-6 h-6 ${colors.iconColor}`} />
            </motion.div>
          </div>

          {/* Value */}
          <motion.div
            key={value}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-2"
          >
            <h3 className="text-3xl font-bold text-discord-text">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </h3>
          </motion.div>

          {/* Trend */}
          {trend && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-2"
            >
              <div
                className={`
                  flex items-center gap-1 text-sm font-semibold
                  ${trend.isPositive ? colors.trendPositive : colors.trendNegative}
                `}
              >
                <span>{trend.isPositive ? '↑' : '↓'}</span>
                <span>{Math.abs(trend.value)}%</span>
              </div>
              <span className="text-xs text-discord-muted">vs last period</span>
            </motion.div>
          )}
        </div>

        {/* Bottom gradient line */}
        <div
          className={`
            absolute bottom-0 left-0 right-0 h-1
            bg-gradient-to-r from-transparent via-blurple-500/50 to-transparent
            opacity-0 group-hover:opacity-100 transition-opacity duration-300
          `}
        />
      </div>

      {/* Glow effect */}
      <div
        className="absolute inset-0 -z-10 blur-xl opacity-0 group-hover:opacity-20 transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${
            color === 'blurple' ? '#5865F2' :
            color === 'success' ? '#23a559' :
            color === 'danger' ? '#f23f43' :
            '#f0b232'
          }, transparent)`,
        }}
      />
    </motion.div>
  );
}
