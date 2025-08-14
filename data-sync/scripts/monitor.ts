#!/usr/bin/env tsx

import { config } from 'dotenv';
import { connectPrisma, prisma } from '../src/infra/db/prisma.client';
import { connectRedis, redis } from '../src/infra/redis/redis.client';
import { getQueueStats } from '../src/infra/queues/queue.manager';
import { register } from '../src/infra/metrics/prometheus';
import { logger } from '../src/utils/logger';

config({ path: '.env', override: true });

interface MonitoringReport {
  timestamp: string;
  uptime: number;
  system: {
    redis: boolean;
    database: boolean;
    overall: boolean;
  };
  queues: {
    waiting: number;
    active: number;
    failed: number;
    total: number;
    throughput: number; // jobs per minute
  };
  alerts: string[];
  metrics: {
    jobsProcessedLastHour: number;
    errorRate: number;
    avgJobDuration: number;
  };
}

class MonitoringService {
  private startTime: number = Date.now();
  private lastMetricsSnapshot: any = null;
  
  async generateReport(): Promise<MonitoringReport> {
    const timestamp = new Date().toISOString();
    const uptime = (Date.now() - this.startTime) / 1000;
    
    // Check system health
    const systemHealth = await this.checkSystemHealth();
    
    // Get queue statistics
    const queueStats = await this.getQueueStatistics();
    
    // Generate alerts
    const alerts = this.generateAlerts(systemHealth, queueStats);
    
    // Get metrics
    const metrics = await this.getMetrics();
    
    return {
      timestamp,
      uptime,
      system: systemHealth,
      queues: queueStats,
      alerts,
      metrics,
    };
  }
  
  private async checkSystemHealth() {
    let redisConnected = false;
    let database = false;
    
    try {
      const redisResult = await redis.ping();
      redisConnected = redisResult === 'PONG';
    } catch (error: any) {
      logger.warn('Redis health check failed');
    }
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = true;
    } catch (error: any) {
      logger.warn('Database health check failed');
    }
    
    return {
      redis: redisConnected,
      database,
      overall: redisConnected && database,
    };
  }
  
  private async getQueueStatistics() {
    try {
      const stats = await getQueueStats();
      
      // Calculate throughput (rough estimate based on completed jobs)
      const currentTime = Date.now();
      let throughput = 0;
      
      if (this.lastMetricsSnapshot) {
        const timeDiff = (currentTime - this.lastMetricsSnapshot.timestamp) / 60000; // minutes
        const jobsDiff = stats.completed - this.lastMetricsSnapshot.completed;
        throughput = timeDiff > 0 ? Math.round(jobsDiff / timeDiff) : 0;
      }
      
      this.lastMetricsSnapshot = {
        timestamp: currentTime,
        completed: stats.completed,
      };
      
      return {
        waiting: stats.waiting,
        active: stats.active,
        failed: stats.failed,
        total: stats.total,
        throughput,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get queue statistics');
      return {
        waiting: 0,
        active: 0,
        failed: 0,
        total: 0,
        throughput: 0,
      };
    }
  }
  
  private generateAlerts(systemHealth: any, queueStats: any): string[] {
    const alerts: string[] = [];
    
    // System health alerts
    if (!systemHealth.redis) {
      alerts.push('🔴 Redis connection is down');
    }
    
    if (!systemHealth.database) {
      alerts.push('🔴 Database connection is down');
    }
    
    // Queue health alerts
    if (queueStats.failed > 10) {
      alerts.push(`⚠️ High number of failed jobs: ${queueStats.failed}`);
    }
    
    if (queueStats.active > 20) {
      alerts.push(`⚠️ High number of active jobs: ${queueStats.active}`);
    }
    
    if (queueStats.waiting > 100) {
      alerts.push(`⚠️ Large queue backlog: ${queueStats.waiting} jobs waiting`);
    }
    
    if (queueStats.throughput === 0 && queueStats.waiting > 0) {
      alerts.push('🔴 Queue processing appears to be stalled');
    }
    
    return alerts;
  }
  
  private async getMetrics() {
    try {
      const metricsText = await register.metrics();
      
      // Parse basic metrics from Prometheus format
      const jobsProcessedMatch = metricsText.match(/data_sync_jobs_processed_total.*?(\d+)/);
      const jobsProcessedLastHour = jobsProcessedMatch ? parseInt(jobsProcessedMatch[1]) : 0;
      
      // Calculate error rate (simplified)
      const successfulJobs = (metricsText.match(/status="success"/g) || []).length;
      const failedJobs = (metricsText.match(/status="failed"/g) || []).length;
      const totalJobs = successfulJobs + failedJobs;
      const errorRate = totalJobs > 0 ? (failedJobs / totalJobs) * 100 : 0;
      
      // Average job duration (simplified extraction)
      const durationMatch = metricsText.match(/data_sync_job_duration_seconds_sum.*?(\d+\.?\d*)/);
      const countMatch = metricsText.match(/data_sync_job_duration_seconds_count.*?(\d+)/);
      const avgJobDuration = durationMatch && countMatch ? 
        parseFloat(durationMatch[1]) / parseInt(countMatch[1]) : 0;
      
      return {
        jobsProcessedLastHour,
        errorRate: Math.round(errorRate * 100) / 100,
        avgJobDuration: Math.round(avgJobDuration * 1000) / 1000, // round to 3 decimal places
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to parse metrics');
      return {
        jobsProcessedLastHour: 0,
        errorRate: 0,
        avgJobDuration: 0,
      };
    }
  }
  
  printReport(report: MonitoringReport) {
    console.log('\n📊 DATA-SYNC MONITORING REPORT');
    console.log('='.repeat(50));
    console.log(`🕐 Timestamp: ${report.timestamp}`);
    console.log(`⏱️  Uptime: ${Math.round(report.uptime / 60)} minutes`);
    
    console.log('\n🏥 SYSTEM HEALTH:');
    console.log(`  Redis: ${report.system.redis ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`  Database: ${report.system.database ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`  Overall: ${report.system.overall ? '✅ Healthy' : '❌ Unhealthy'}`);
    
    console.log('\n📈 QUEUE STATISTICS:');
    console.log(`  Waiting: ${report.queues.waiting}`);
    console.log(`  Active: ${report.queues.active}`);
    console.log(`  Failed: ${report.queues.failed}`);
    console.log(`  Total: ${report.queues.total}`);
    console.log(`  Throughput: ${report.queues.throughput} jobs/min`);
    
    console.log('\n📊 METRICS:');
    console.log(`  Jobs Processed: ${report.metrics.jobsProcessedLastHour}`);
    console.log(`  Error Rate: ${report.metrics.errorRate}%`);
    console.log(`  Avg Job Duration: ${report.metrics.avgJobDuration}s`);
    
    if (report.alerts.length > 0) {
      console.log('\n🚨 ALERTS:');
      report.alerts.forEach(alert => console.log(`  ${alert}`));
    } else {
      console.log('\n✅ No alerts - system operating normally');
    }
    
    console.log('\n' + '='.repeat(50));
  }
  
  async sendAlert(alert: string) {
    // Placeholder for alert sending (email, Slack, webhook, etc.)
    logger.warn({ alert }, 'System alert generated');
    console.log(`🚨 ALERT: ${alert}`);
    
    // TODO: Implement actual alerting mechanism
    // Examples:
    // - Send to Slack webhook
    // - Send email via SMTP
    // - Send to PagerDuty
    // - Post to Discord webhook
  }
}

interface MonitorOptions {
  interval?: number;
  continuous?: boolean;
  alerts?: boolean;
  format?: 'text' | 'json';
}

function parseArgs(): MonitorOptions {
  const args = process.argv.slice(2);
  const options: MonitorOptions = {
    interval: 60, // default 60 seconds
    continuous: false,
    alerts: true,
    format: 'text',
  };

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--interval':
        options.interval = parseInt(value) || 60;
        break;
      case '--continuous':
        options.continuous = true;
        i--; // No value for this flag
        break;
      case '--no-alerts':
        options.alerts = false;
        i--; // No value for this flag
        break;
      case '--format':
        if (['text', 'json'].includes(value)) {
          options.format = value as 'text' | 'json';
        }
        break;
      case '--help':
        showHelp();
        process.exit(0);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
📊 Data-Sync Monitoring Tool

Usage:
  npm run monitor [options]

Options:
  --interval <seconds>    Monitoring interval in seconds (default: 60)
  --continuous           Run continuously instead of single report
  --no-alerts            Disable alert generation
  --format <text|json>   Output format (default: text)
  --help                 Show this help

Examples:
  npm run monitor                           # Single report
  npm run monitor -- --continuous          # Continuous monitoring
  npm run monitor -- --interval 30         # Every 30 seconds
  npm run monitor -- --format json         # JSON output
  `);
}

async function main() {
  const options = parseArgs();
  const monitor = new MonitoringService();
  
  logger.info({ options }, 'Starting monitoring service');
  
  try {
    // Connect to services
    await connectPrisma();
    await connectRedis();
    
    if (options.continuous) {
      console.log(`🔄 Starting continuous monitoring (interval: ${options.interval}s)`);
      console.log('Press Ctrl+C to stop');
      
      while (true) {
        try {
          const report = await monitor.generateReport();
          
          if (options.format === 'json') {
            console.log(JSON.stringify(report, null, 2));
          } else {
            monitor.printReport(report);
          }
          
          // Check for critical alerts
          if (options.alerts) {
            const criticalAlerts = report.alerts.filter(alert => alert.includes('🔴'));
            for (const alert of criticalAlerts) {
              await monitor.sendAlert(alert);
            }
          }
          
          // Wait for next interval
          await new Promise(resolve => setTimeout(resolve, (options.interval || 60) * 1000));
        } catch (error: any) {
          logger.error({ error: error.message }, 'Monitoring cycle failed');
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before retry
        }
      }
    } else {
      // Single report
      const report = await monitor.generateReport();
      
      if (options.format === 'json') {
        console.log(JSON.stringify(report, null, 2));
      } else {
        monitor.printReport(report);
      }
    }
    
  } catch (error: any) {
    logger.error({ error: error.message }, 'Monitoring failed to start');
    console.error('❌ Monitoring failed:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Monitoring stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Monitoring terminated');
  process.exit(0);
});

main();