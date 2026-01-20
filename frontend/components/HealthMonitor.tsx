'use client';

import { motion } from 'framer-motion';
import { Activity, Database, Zap, Server } from 'lucide-react';
import type { HealthStatus } from '@/lib/types';

interface HealthMonitorProps {
  health: HealthStatus | null;
}

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  icon: typeof Activity;
  metric?: string;
}

export function HealthMonitor({ health }: HealthMonitorProps) {
  const isHealthy = health?.status === 'healthy' && health?.redis === 'connected';

  const services: ServiceStatus[] = [
    {
      name: 'API',
      status: health ? 'healthy' : 'down',
      icon: Server,
    },
    {
      name: 'Redis',
      status: health?.redis === 'connected' ? 'healthy' : 'down',
      icon: Zap,
      metric: health ? `${health.queue_length} queued` : undefined,
    },
    {
      name: 'Worker',
      status: isHealthy ? 'healthy' : 'degraded',
      icon: Activity,
    },
    {
      name: 'PostgreSQL',
      status: isHealthy ? 'healthy' : 'degraded',
      icon: Database,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-card-strong p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-discord-text mb-1">
            System Health
          </h2>
          <p className="text-sm text-discord-muted">
            Real-time service monitoring
          </p>
        </div>

        {/* Overall Status Indicator */}
        <div className="flex items-center gap-3">
          <div className="relative">
            {/* Pulsing rings */}
            {isHealthy && (
              <>
                <div className="pulse-ring bg-success" />
                <div className="pulse-ring bg-success" style={{ animationDelay: '1s' }} />
              </>
            )}

            {/* Status dot */}
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className={`
                w-4 h-4 rounded-full relative z-10
                ${isHealthy ? 'bg-success shadow-lg shadow-success/50' : 'bg-danger shadow-lg shadow-danger/50'}
              `}
            />
          </div>

          <div className="text-right">
            <div
              className={`
                text-sm font-semibold
                ${isHealthy ? 'text-success' : 'text-danger'}
              `}
            >
              {isHealthy ? 'All Systems Operational' : 'System Issues Detected'}
            </div>
            <div className="text-xs text-discord-muted">
              {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>

      {/* Service Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {services.map((service, index) => (
          <ServiceCard
            key={service.name}
            service={service}
            delay={index * 0.1}
          />
        ))}
      </div>
    </motion.div>
  );
}

function ServiceCard({
  service,
  delay,
}: {
  service: ServiceStatus;
  delay: number;
}) {
  const Icon = service.icon;

  const statusConfig = {
    healthy: {
      color: 'text-success',
      bg: 'bg-success/10',
      border: 'border-success/30',
      dot: 'bg-success',
      label: 'Healthy',
    },
    degraded: {
      color: 'text-warning',
      bg: 'bg-warning/10',
      border: 'border-warning/30',
      dot: 'bg-warning',
      label: 'Degraded',
    },
    down: {
      color: 'text-danger',
      bg: 'bg-danger/10',
      border: 'border-danger/30',
      dot: 'bg-danger',
      label: 'Down',
    },
  };

  const config = statusConfig[service.status];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ scale: 1.05 }}
      className={`
        relative p-4 rounded-lg
        bg-discord-dark/50 backdrop-blur-sm
        border ${config.border}
        transition-all duration-200
        cursor-pointer
      `}
    >
      {/* Service Icon */}
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${config.bg}`}>
          <Icon className={`w-4 h-4 ${config.color}`} />
        </div>

        {/* Status Dot */}
        <div className="relative">
          {service.status === 'healthy' && (
            <motion.div
              animate={{ opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`absolute inset-0 ${config.dot} rounded-full blur-sm`}
            />
          )}
          <div className={`w-2 h-2 rounded-full ${config.dot} relative`} />
        </div>
      </div>

      {/* Service Name */}
      <div className="mb-1">
        <h3 className="text-sm font-semibold text-discord-text">
          {service.name}
        </h3>
        <p className={`text-xs font-medium ${config.color}`}>
          {config.label}
        </p>
      </div>

      {/* Metric */}
      {service.metric && (
        <div className="text-xs text-discord-muted mt-2">
          {service.metric}
        </div>
      )}

      {/* Bottom accent */}
      <div
        className={`
          absolute bottom-0 left-0 right-0 h-0.5
          ${config.bg}
        `}
      />
    </motion.div>
  );
}
